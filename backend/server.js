// backend/server.js
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT_BACKEND = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};
const pool = mysql.createPool(dbConfig);

let sseClients = [];
function sendEventToAllClients(data) {
    console.log('SSE Event ->: ', data.type);
    sseClients.forEach(client => client.res.write(`data: ${JSON.stringify(data)}\n\n`));
}

app.get('/api/pedidos/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const clientId = Date.now();
    sseClients.push({ id: clientId, res });
    console.log(`SSE Client connected: ${clientId}`);
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE Stream Connected' })}\n\n`);
    const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 20000);
    req.on('close', () => {
        clearInterval(heartbeat);
        sseClients = sseClients.filter(c => c.id !== clientId);
        console.log(`SSE Client disconnected: ${clientId}`);
        res.end();
    });
});

// --- API Endpoints ---
const PEDIDOS_TABLE = 'pedidos_lanches';
const STATUS_PEDIDO_RECEBIDO = 'Pedido Recebido';
const STATUS_EM_PREPARO = 'Em Preparo';
const STATUS_PRONTO = 'Pronto';
const STATUS_FINALIZADO = 'Finalizado'; // Para pedidos entregues/retirados

// GET todos os pedidos (ativos e finalizados, frontend filtra)
app.get('/api/pedidos', async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT * FROM ${PEDIDOS_TABLE} ORDER BY criado_em DESC`);
        res.json(rows);
    } catch (error) {
        console.error(`Erro GET /api/pedidos:`, error);
        res.status(500).json({ message: 'Erro ao buscar pedidos.' });
    }
});

// POST novo pedido
app.post('/api/pedidos', async (req, res) => {
    const { cliente_nome, lanche_descricao, observacoes, tipo_entrega, endereco_entrega } = req.body;
    if (!cliente_nome || !lanche_descricao) {
        return res.status(400).json({ message: 'Nome do cliente e descrição do lanche são obrigatórios.' });
    }
    try {
        const [result] = await pool.query(
            `INSERT INTO ${PEDIDOS_TABLE} (cliente_nome, lanche_descricao, observacoes, tipo_entrega, endereco_entrega, status) VALUES (?, ?, ?, ?, ?, ?)`,
            [cliente_nome, lanche_descricao, observacoes, tipo_entrega || 'Retirada', endereco_entrega, STATUS_PEDIDO_RECEBIDO]
        );
        const [newPedidoRow] = await pool.query(`SELECT * FROM ${PEDIDOS_TABLE} WHERE id = ?`, [result.insertId]);
        sendEventToAllClients({ type: 'pedido_adicionado', data: newPedidoRow[0] });
        res.status(201).json(newPedidoRow[0]);
    } catch (error) {
        console.error(`Erro POST /api/pedidos:`, error);
        res.status(500).json({ message: 'Erro ao criar pedido.' });
    }
});

// PUT atualizar status do pedido
app.put('/api/pedidos/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    // Status válidos que podem ser definidos através desta rota pela UI de gerenciamento
    const validOperationalStatus = [STATUS_PEDIDO_RECEBIDO, STATUS_EM_PREPARO, STATUS_PRONTO];

    if (!status || !validOperationalStatus.includes(status)) {
        return res.status(400).json({ message: `Status inválido. Os status operacionais permitidos são: ${validOperationalStatus.join(', ')}.` });
    }

    try {
        // Opcional: Poderia adicionar lógica aqui para verificar se a transição de status é válida
        // (ex: não pular de "Pedido Recebido" direto para "Pronto" sem passar por "Em Preparo",
        // mas para flexibilidade, manteremos simples por enquanto).

        const [result] = await pool.query(`UPDATE ${PEDIDOS_TABLE} SET status = ? WHERE id = ?`, [status, id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Pedido não encontrado.' });

        const [updatedPedidoRow] = await pool.query(`SELECT * FROM ${PEDIDOS_TABLE} WHERE id = ?`, [id]);
        sendEventToAllClients({ type: 'pedido_atualizado', data: updatedPedidoRow[0] });
        res.json(updatedPedidoRow[0]);
    } catch (error) {
        console.error(`Erro PUT /api/pedidos/${id}/status:`, error);
        res.status(500).json({ message: 'Erro ao atualizar status.' });
    }
});

// PUT marcar pedido como Finalizado (Entregue/Retirado)
app.put('/api/pedidos/:id/finalizar', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query(`UPDATE ${PEDIDOS_TABLE} SET status = ? WHERE id = ?`, [STATUS_FINALIZADO, id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Pedido não encontrado.' });
        const [updatedPedidoRow] = await pool.query(`SELECT * FROM ${PEDIDOS_TABLE} WHERE id = ?`, [id]);
        sendEventToAllClients({ type: 'pedido_atualizado', data: updatedPedidoRow[0] }); // ou 'pedido_finalizado'
        res.json(updatedPedidoRow[0]);
    } catch (error) {
        console.error(`Erro PUT /api/pedidos/${id}/finalizar:`, error);
        res.status(500).json({ message: 'Erro ao finalizar pedido.' });
    }
});

// DELETE pedido (para cancelamentos/erros)
app.delete('/api/pedidos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query(`DELETE FROM ${PEDIDOS_TABLE} WHERE id = ?`, [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Pedido não encontrado.' });
        sendEventToAllClients({ type: 'pedido_removido', data: { id: parseInt(id) } });
        res.status(200).json({ message: 'Pedido removido com sucesso.' });
    } catch (error) {
        console.error(`Erro DELETE /api/pedidos/${id}:`, error);
        res.status(500).json({ message: 'Erro ao remover pedido.' });
    }
});

// Servir páginas HTML
app.get(['/', '/cliente', '/cliente.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cliente.html'));
});
app.get(['/admin', '/admin.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Global error handlers
app.use((req, res) => res.status(404).json({ message: 'Rota não encontrada.' }));
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Erro interno do servidor.' });
});

app.listen(PORT_BACKEND, () => {
    console.log(`Servidor Lanchonete Naturais rodando na porta ${PORT_BACKEND}`);
    console.log(`Conectado ao banco: ${process.env.DB_DATABASE}`);
});