// backend/public/script.js



// const API_BASE_URL = 'http://localhost:4000/api';

// Abaixo para usar ngrok(usar máquina como servidor)
const API_BASE_URL = '/api'; // Caminho relativo, já que o backend serve o frontend
let pedidos = [];


// Constantes de Status (para consistência com o backend)
const STATUS_PEDIDO_RECEBIDO = 'Pedido Recebido';
const STATUS_EM_PREPARO = 'Em Preparo';
const STATUS_PRONTO = 'Pronto';
const STATUS_FINALIZADO = 'Finalizado';

// --- Funções de API ---
async function fetchApi(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
            throw new Error(errorData.message);
        }
        if (response.status === 204) return null; // No Content
        return response.json();
    } catch (error) {
        console.error(`Erro na API ${options.method || 'GET'} ${url}:`, error);
        alert(`Erro na operação: ${error.message}`);
        return null; // Retorna null em caso de erro para a função chamadora lidar
    }
}

async function carregarPedidos() {
    const data = await fetchApi(`${API_BASE_URL}/pedidos`);
    if (data) pedidos = data;
    return pedidos;
}
async function adicionarPedido(novoPedido) {
    return await fetchApi(`${API_BASE_URL}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novoPedido)
    });
}
async function atualizarStatusPedido(id, novoStatus) {
    return await fetchApi(`${API_BASE_URL}/pedidos/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus })
    });
}
async function finalizarPedido(id) {
    return await fetchApi(`${API_BASE_URL}/pedidos/${id}/finalizar`, { method: 'PUT' });
}
async function deletarPedido(id) {
    return await fetchApi(`${API_BASE_URL}/pedidos/${id}`, { method: 'DELETE' });
}

// --- Funções de Renderização ---
function renderizarTelaCliente() {
    const recebidosDiv = document.getElementById('pedidosRecebidos');
    const emPreparoDiv = document.getElementById('pedidosEmPreparo');
    const prontosDiv = document.getElementById('pedidosProntos');

    if (!recebidosDiv || !emPreparoDiv || !prontosDiv) return;

    recebidosDiv.innerHTML = '';
    emPreparoDiv.innerHTML = '';
    prontosDiv.innerHTML = '';

    const pedidosAtivos = pedidos.filter(p => p.status !== STATUS_FINALIZADO);

    if (pedidosAtivos.length === 0) {
        const msg = pedidos.length > 0 ?
            '<p class="text-gray-500 italic">Todos os pedidos atuais foram concluídos!</p>' :
            '<p class="text-gray-500 italic">Nenhum pedido ativo no momento.</p>';
        [recebidosDiv, emPreparoDiv, prontosDiv].forEach(div => div.innerHTML = msg);
        return;
    }

    let countRecebido = 0, countPreparo = 0, countPronto = 0;

    pedidosAtivos.forEach(pedido => {
        const card = document.createElement('div');
        card.className = 'bg-lanche-light p-3 rounded-md border border-gray-200 shadow-sm status-pedido card-hover';
        card.innerHTML = `
            <div class="font-semibold text-lanche-dark text-lg">${pedido.cliente_nome}</div>
            <div class="text-sm text-gray-700">${pedido.lanche_descricao}</div>
            ${pedido.observacoes ? `<div class="text-xs text-gray-500 mt-1">Obs: ${pedido.observacoes}</div>` : ''}
            ${pedido.tipo_entrega === 'Delivery' ? `<div class="text-xs text-gray-500 mt-1"><i class="fas fa-motorcycle mr-1"></i> Delivery</div>` : ''}
        `;
        if (pedido.status === STATUS_PEDIDO_RECEBIDO) { recebidosDiv.appendChild(card); countRecebido++; }
        else if (pedido.status === STATUS_EM_PREPARO) { emPreparoDiv.appendChild(card); countPreparo++; }
        else if (pedido.status === STATUS_PRONTO) { prontosDiv.appendChild(card); countPronto++; }
    });

    if (countRecebido === 0) recebidosDiv.innerHTML = '<p class="text-gray-500 italic">Nenhum pedido aguardando.</p>';
    if (countPreparo === 0) emPreparoDiv.innerHTML = '<p class="text-gray-500 italic">Nenhum lanche em preparo.</p>';
    if (countPronto === 0) prontosDiv.innerHTML = '<p class="text-gray-500 italic">Nenhum lanche pronto.</p>';
}

function renderizarTelaAdmin() {
    const tbody = document.getElementById('listaPedidosAtivos');
    if (!tbody) return;
    tbody.innerHTML = '';

    const pedidosAtivos = pedidos.filter(p => p.status !== STATUS_FINALIZADO);

    if (pedidosAtivos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-gray-500 italic">Nenhum pedido ativo para gerenciar.</td></tr>';
        return;
    }

    const statusOrderFlow = [STATUS_PEDIDO_RECEBIDO, STATUS_EM_PREPARO, STATUS_PRONTO];
    pedidosAtivos.sort((a, b) => { // Ordenar por status e depois por data
        const orderA = statusOrderFlow.indexOf(a.status);
        const orderB = statusOrderFlow.indexOf(b.status);
        if (orderA !== orderB) return orderA - orderB;
        return new Date(a.criado_em) - new Date(b.criado_em);
    });

    pedidosAtivos.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50';
        let statusColorClass = '';
        if (p.status === STATUS_PEDIDO_RECEBIDO) statusColorClass = 'bg-blue-100 text-blue-800';
        else if (p.status === STATUS_EM_PREPARO) statusColorClass = 'bg-yellow-100 text-yellow-800';
        else if (p.status === STATUS_PRONTO) statusColorClass = 'bg-green-100 text-green-800';

        // Lógica para botões de avançar/retroceder
        const currentIndex = statusOrderFlow.indexOf(p.status);
        let btnVoltarHtml = `<span class="inline-block w-8 h-8"></span>`; // Espaçador
        if (currentIndex > 0) { // Pode voltar
            btnVoltarHtml = `
                <button onclick="handleMudarStatus(${p.id}, 'anterior')" title="Voltar Status" class="text-orange-500 hover:text-orange-700 p-1.5 rounded-md">
                    <i class="fas fa-arrow-left fa-fw"></i>
                </button>`;
        }

        let btnAvancarHtml = `<span class="inline-block w-8 h-8"></span>`; // Espaçador
        if (currentIndex < statusOrderFlow.length - 1) { // Pode avançar
            btnAvancarHtml = `
                <button onclick="handleMudarStatus(${p.id}, 'proximo')" title="Avançar Status" class="text-teal-500 hover:text-teal-700 p-1.5 rounded-md">
                    <i class="fas fa-arrow-right fa-fw"></i>
                </button>`;
        }
        
        let btnFinalizarHtml = `<span class="inline-block w-8 h-8"></span>`; // Espaçador
        if (p.status === STATUS_PRONTO) { // Só pode finalizar se estiver pronto
            btnFinalizarHtml = `
                <button onclick="handleFinalizarPedido(${p.id})" title="Finalizar Pedido (Entregue/Retirado)" class="text-blue-600 hover:text-blue-800 p-1.5 rounded-md">
                    <i class="fas fa-check-double fa-fw"></i>
                </button>`;
        }

        tr.innerHTML = `
            <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${p.id}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700">${p.cliente_nome}</td>
            <td class="px-4 py-3 text-sm text-gray-700 max-w-xs truncate" title="${p.lanche_descricao}">${p.lanche_descricao}</td>
            <td class="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" title="${p.observacoes || ''}">${p.observacoes || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                ${p.tipo_entrega === 'Delivery' ? `<i class="fas fa-motorcycle text-orange-500 mr-1" title="Delivery"></i>` : `<i class="fas fa-store text-blue-500 mr-1" title="Retirada"></i>`}
                ${p.tipo_entrega}
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-sm">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColorClass}">
                    ${p.status}
                </span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-sm font-medium">
                <div class="flex items-center space-x-1">
                    ${btnVoltarHtml}
                    ${btnAvancarHtml}
                    ${btnFinalizarHtml}
                    <button onclick="handleDeletarPedido(${p.id})" title="Deletar Pedido" class="text-red-600 hover:text-red-800 p-1.5 rounded-md">
                        <i class="fas fa-trash fa-fw"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Manipuladores de Ação ---
async function handleMudarStatus(id, direcao) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;

    const statusOrderFlow = [STATUS_PEDIDO_RECEBIDO, STATUS_EM_PREPARO, STATUS_PRONTO];
    const currentIndex = statusOrderFlow.indexOf(pedido.status);
    let novoStatus = pedido.status;

    if (direcao === 'proximo' && currentIndex < statusOrderFlow.length - 1) {
        novoStatus = statusOrderFlow[currentIndex + 1];
    } else if (direcao === 'anterior' && currentIndex > 0) {
        novoStatus = statusOrderFlow[currentIndex - 1];
    }

    if (novoStatus !== pedido.status) {
        await atualizarStatusPedido(id, novoStatus);
        // SSE atualizará a UI
    } else {
        console.warn(`Não é possível mover o status '${pedido.status}' na direção '${direcao}'.`);
    }
}
async function handleFinalizarPedido(id) {
    if (confirm(`Confirmar finalização do pedido ID ${id} (entregue/retirado)?`)) {
        await finalizarPedido(id);
        // SSE atualizará a UI
    }
}
async function handleDeletarPedido(id) {
    if (confirm(`ATENÇÃO: Deletar permanentemente o pedido ID ${id}? Esta ação não pode ser desfeita.`)) {
        await deletarPedido(id);
        // SSE atualizará a UI
    }
}
async function handleSubmitNovoPedido(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const novoPedido = Object.fromEntries(formData.entries());

    if (!novoPedido.cliente_nome || !novoPedido.lanche_descricao) {
        alert("Nome do cliente e Lanche(s) são obrigatórios!");
        return;
    }
    // Se tipo_entrega não for Delivery, limpa o endereço
    if (novoPedido.tipo_entrega !== 'Delivery') {
        novoPedido.endereco_entrega = null;
    }

    const pedidoAdicionado = await adicionarPedido(novoPedido);
    if (pedidoAdicionado) {
        form.reset();
        document.getElementById('campo_endereco_entrega').classList.add('hidden'); // Reseta visibilidade
        // SSE atualizará a UI
    }
}

// --- Lógica SSE ---
function connectToEventSource() {
    const eventSource = new EventSource(`${API_BASE_URL}/pedidos/events`);
    eventSource.onopen = () => console.log("SSE: Conectado ao Lanchonete Event Stream");
    eventSource.onmessage = (event) => {
        try {
            const parsedData = JSON.parse(event.data);
            if (parsedData.type === 'heartbeat' || event.data.startsWith(':')) return;

            console.log("SSE: Recebido ", parsedData.type, parsedData.data);
            let changed = false;
            if (parsedData.type === 'pedido_adicionado') {
                if (!pedidos.find(p => p.id === parsedData.data.id)) {
                    pedidos.push(parsedData.data);
                    changed = true;
                }
            } else if (parsedData.type === 'pedido_atualizado') {
                const index = pedidos.findIndex(p => p.id === parsedData.data.id);
                if (index !== -1) {
                    pedidos[index] = parsedData.data;
                    changed = true;
                } else { // Adiciona se não existir (ex: cliente reconectou)
                    pedidos.push(parsedData.data);
                    changed = true;
                }
            } else if (parsedData.type === 'pedido_removido') {
                const oldLength = pedidos.length;
                pedidos = pedidos.filter(p => p.id !== parsedData.data.id);
                if (pedidos.length !== oldLength) changed = true;
            } else if (parsedData.type === 'connected') {
                 // Opcional: carregarPedidos().then(renderCurrentPage); // Forçar sincronia ao conectar
                return; // Não precisa renderizar só por conectar
            }

            if (changed) renderCurrentPage();

        } catch (e) {
            console.error("SSE: Erro ao processar mensagem", e, event.data);
        }
    };
    eventSource.onerror = (err) => {
        console.error("SSE: Erro na conexão", err);
        eventSource.close();
        setTimeout(connectToEventSource, 5000); // Tentar reconectar
    };
}

function renderCurrentPage() {
    if (document.getElementById('pedidosRecebidos')) renderizarTelaCliente();
    if (document.getElementById('listaPedidosAtivos')) renderizarTelaAdmin();
}

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', async () => {
    await carregarPedidos();
    renderCurrentPage();
    connectToEventSource();

    // Listeners específicos da página Admin
    if (document.getElementById('listaPedidosAtivos')) {
        const form = document.getElementById('formNovoPedido');
        if (form) form.addEventListener('submit', handleSubmitNovoPedido);

        // Lógica para mostrar/ocultar campo de endereço
        const tipoEntregaSelect = document.getElementById('tipo_entrega');
        const campoEndereco = document.getElementById('campo_endereco_entrega');
        const inputEndereco = document.getElementById('endereco_entrega');
        if (tipoEntregaSelect && campoEndereco) {
            tipoEntregaSelect.addEventListener('change', function() {
                if (this.value === 'Delivery') {
                    campoEndereco.classList.remove('hidden');
                    inputEndereco.required = true;
                } else {
                    campoEndereco.classList.add('hidden');
                    inputEndereco.required = false;
                    inputEndereco.value = ''; // Limpa o campo
                }
            });
        }
    }
});