const App = {
    // Almacenamiento local de los datos de la base de datos
    db: {
        players: [],
        applications: []
    },
    // Estado actual de la sesión del usuario
    state: {
        loggedInPlayerId: null,
        isSpectator: false,
        isStaff: false
    },
    // Caché de elementos del DOM para un acceso más rápido
    elements: {},
    // Constantes de la aplicación
    POSITIONS: ['POR', 'DFC', 'LTD', 'LTI', 'MCD', 'MC', 'MCO', 'ED', 'EI', 'DC'],
    SKILLS: ['Velocidad', 'Tiro', 'Pase Clave', 'Regate', 'Entradas', 'Fuerza', 'Visión', 'Reflejos', 'Resistencia', 'Lectura de Juego', 'Cabezazo', 'Centros'],
    icons: {
        jersey: `<svg class="jersey-svg" viewBox="0 0 100 100"><defs><clipPath id="jerseyClip"><path d="M20,5 L35,5 L50,15 L65,5 L80,5 L70,25 L85,95 L15,95 L30,25 Z"/></clipPath></defs><g clip-path="url(#jerseyClip)"><rect x="0" y="0" width="50" height="100" fill="#111"/><rect x="50" y="0" width="50" height="100" fill="#d41818"/></g></svg>`,
        redCard: `<div class="red-card-icon"></div>`,
        logout: `<svg fill="currentColor" viewBox="0 0 20 20" width="20" height="20"><path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd"></path></svg>`
    },

    /**
     * Punto de entrada principal de la aplicación.
     */
    async init() {
        this.cacheElements();
        this.setupEventListeners();
        try {
            this.showNotification('Cargando datos del equipo...', 'info', 2000);
            const data = await this.apiCall('/api/data', 'GET');
            this.db = data;
            this.checkSession();
        } catch (error) {
            this.showNotification(error.message, 'error');
            this.elements.loader.innerHTML = `<p style="color: var(--text-secondary);">${error.message}</p>`;
        } finally {
            setTimeout(() => this.elements.loader.classList.remove('show'), 500);
        }
    },

    /**
     * Guarda referencias a los elementos del DOM más utilizados.
     */
    cacheElements() {
        this.elements = {
            loader: document.getElementById('loader'),
            roleSelectionScreen: document.getElementById('role-selection-screen'),
            mainContainer: document.getElementById('mainContainer'),
            playersGrid: document.getElementById('playersGrid'),
            summaryBody: document.getElementById('summaryBody'),
            modalContainer: document.getElementById('modal-container'),
            staffBtn: document.getElementById('staffBtn'),
            notificationContainer: document.getElementById('notification-container'),
            mainTitle: document.getElementById('main-title'),
            mainSubtitle: document.getElementById('main-subtitle'),
            mainFooter: document.getElementById('mainFooter')
        };
    },

    /**
     * Configura todos los listeners de eventos de la aplicación.
     */
    setupEventListeners() {
        // Listener para la pantalla de selección de rol inicial
        this.elements.roleSelectionScreen.addEventListener('click', e => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (action === 'player-login') this.openLoginModal();
            if (action === 'spectator-login') this.enterAsSpectator();
        });

        // Listener para el botón flotante de Staff
        this.elements.staffBtn.addEventListener('click', () => {
            this.state.isStaff ? this.openStaffPanel() : this.openStaffLoginModal();
        });
        
        // Delegación de eventos en el cuerpo del documento para acciones comunes
        document.body.addEventListener('click', e => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const { action, id } = target.dataset;
            const actions = {
                showApplication: () => this.openApplicationModal(),
                logout: () => this.logout(),
                logoutStaff: () => this.logoutStaff(),
                addPlayer: () => this.openEditPlayerModal(null),
                editPlayer: () => this.openEditPlayerModal(id),
                approveApplication: () => this.handleApplication(id, true),
                rejectApplication: () => this.handleApplication(id, false),
            };

            if (actions[action]) actions[action]();
        });

        // Listeners para las tarjetas de jugador (clic y efecto hover)
        this.elements.playersGrid.addEventListener('click', e => {
            const card = e.target.closest('.fifa-card');
            if (!card || this.state.isStaff) return;
            
            if (this.state.isSpectator) {
                return this.showNotification('Estás en modo espectador.', 'info');
            }
            
            const clickedPlayerId = parseInt(card.dataset.playerId);
            if (clickedPlayerId === this.state.loggedInPlayerId && !card.classList.contains('is-expelled')) {
                this.openPlayerActionModal(clickedPlayerId);
            } else {
                this.showNotification('Solo puedes editar tu propia ficha.', 'info');
            }
        });

        this.elements.playersGrid.addEventListener('mousemove', e => {
            const card = e.target.closest('.fifa-card');
            if (!card) return;
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--x', `${x}px`);
            card.style.setProperty('--y', `${y}px`);
        });
    },

    /**
     * Comprueba si hay una sesión de jugador guardada en las cookies.
     */
    checkSession() {
        const loggedInId = this.getCookie('loggedInPlayerId');
        if (loggedInId && this.db.players.some(p => p.id === parseInt(loggedInId))) {
            this.startPlayerSession(parseInt(loggedInId));
        } else {
            this.elements.roleSelectionScreen.classList.remove('hidden');
        }
    },

    /**
     * Inicia la sesión para un jugador.
     * @param {number} playerId - El ID del jugador que inicia sesión.
     */
    startPlayerSession(playerId) {
        this.state.loggedInPlayerId = playerId;
        this.state.isSpectator = false;
        const player = this.db.players.find(p => p.id === playerId);

        this.setCookie('loggedInPlayerId', playerId, 7);
        this.elements.roleSelectionScreen.classList.add('hidden');
        this.elements.mainContainer.classList.remove('hidden');
        this.elements.staffBtn.classList.remove('hidden');

        this.elements.mainTitle.textContent = `BIENVENIDO, ${player.name.toUpperCase()}`;
        this.elements.mainSubtitle.textContent = "Gestiona tu perfil y elige tu nuevo dorsal";
        this.renderAll();
    },

    /**
     * Configura la aplicación en modo espectador.
     */
    enterAsSpectator() {
        this.state.loggedInPlayerId = null;
        this.state.isSpectator = true;
        this.eraseCookie('loggedInPlayerId');

        this.elements.roleSelectionScreen.classList.add('hidden');
        this.elements.mainContainer.classList.remove('hidden');
        this.elements.staffBtn.classList.remove('hidden');

        this.elements.mainTitle.textContent = "NEWELL'S HUB";
        this.elements.mainSubtitle.textContent = "MODO ESPECTADOR";
        this.renderAll();
    },

    /**
     * Cierra la sesión del jugador o espectador y vuelve a la pantalla de inicio.
     */
    logout() {
        this.eraseCookie('loggedInPlayerId');
        this.state.loggedInPlayerId = null;
        this.state.isSpectator = false;
        this.state.isStaff = false;

        this.elements.mainContainer.classList.add('hidden');
        this.elements.staffBtn.classList.add('hidden');
        this.elements.roleSelectionScreen.classList.remove('hidden');
    },

    /**
     * Cierra la sesión del staff, pero mantiene la sesión del usuario.
     */
    logoutStaff() {
        this.state.isStaff = false;
        this.closeModal();
        this.showNotification("Sesión de Staff cerrada.", "info");
    },

    /**
     * Renderiza o actualiza todos los componentes visuales de la aplicación.
     */
    renderAll() {
        this.renderPlayerCards();
        this.renderSummaryTable();
        this.renderFooter();
        // Si el panel de staff está abierto, lo actualiza.
        if (this.state.isStaff && document.querySelector('.staff-modal')) {
            this.openStaffPanel(false); // false para no volver a renderizar la base del modal
        }
    },
    
    // --- FUNCIONES DE RENDERIZADO ---

    renderPlayerCards() {
        this.elements.playersGrid.innerHTML = this.db.players
            .map(p => this.getPlayerCardHTML(p))
            .join('');
    },
    
    getPlayerCardHTML(player) {
        const { id, name, position, skill, number_current, number_new, isExpelled } = player;
        const isCurrentUser = id === this.state.loggedInPlayerId;
        const numberDisplay = number_new ? `#${number_current || '--'} <span class="new-number-tag">(Pide: ${number_new})</span>` : `#${number_current || '--'}`;
        
        return `
            <div class="fifa-card ${isExpelled ? 'is-expelled' : ''} ${isCurrentUser ? 'is-current-user' : ''}" data-player-id="${id}">
                <div class="card-top"><span class="player-skill">${skill || 'N/A'}</span></div>
                <div class="card-jersey-container">${this.icons.jersey}</div>
                <div class="card-bottom">
                    <h3 class="player-name">${name.toUpperCase()}</h3>
                    <p class="player-position">${position || 'Sin Posición'}</p>
                    <div class="player-numbers-display">${numberDisplay}</div>
                </div>
                ${isExpelled ? this.icons.redCard : ''}
            </div>`;
    },

    renderSummaryTable() {
        const sortedPlayers = [...this.db.players].sort((a, b) => (b.stats?.goles || 0) - (a.stats?.goles || 0));
        this.elements.summaryBody.innerHTML = sortedPlayers
            .map(p => `
                <div class="summary-row">
                    <div>${p.name}</div>
                    <div>${p.position || 'N/A'}</div>
                    <div>${p.skill || 'N/A'}</div>
                    <div class="goals">${p.stats?.goles || 0}</div>
                    <div>${p.number_current || '--'}</div>
                    <div>${p.number_new ? `<span class="new-number">${p.number_new}</span>` : '--'}</div>
                </div>`)
            .join('');
    },

    renderFooter() {
        const buttonText = this.state.isSpectator ? "Volver al Inicio" : "Cambiar de Jugador";
        this.elements.mainFooter.innerHTML = `
            <button class="action-btn" data-action="showApplication">¿Eres nuevo? Postúlate</button>
            <button class="action-btn" data-action="logout">${buttonText}</button>`;
    },
    
    // --- MANEJO DE MODALES ---

    openLoginModal() {
        const playerOptions = this.db.players.sort((a, b) => a.name.localeCompare(b.name)).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        const content = `
            <h2>¿Quién Eres?</h2>
            <form id="playerLoginForm">
                <div class="form-group"><label for="playerSelect">Selecciona tu Perfil</label><select id="playerSelect" required><option value="" disabled selected>-- Elige tu nombre --</option>${playerOptions}</select></div>
                <div class="form-group"><label for="playerPass">Contraseña</label><input type="password" id="playerPass" required autocomplete="current-password"></div>
                <button type="submit" class="submit-btn">Entrar</button>
            </form>`;
        this.renderModal(content);
        
        document.getElementById('playerLoginForm').addEventListener('submit', async e => {
            e.preventDefault();
            const selectedId = document.getElementById('playerSelect').value;
            const password = document.getElementById('playerPass').value;
            if (!selectedId) return this.showNotification('Debes seleccionar tu nombre.', 'error');
            
            try {
                await this.apiCall('/api/data', 'POST', { type: 'player_login', payload: { password } });
                this.closeModal();
                this.startPlayerSession(parseInt(selectedId));
            } catch (error) {
                this.showNotification(error.message, 'error');
            }
        });
    },

    openPlayerActionModal(playerId) {
        const player = this.db.players.find(p => p.id === playerId);
        const content = `
            <h2>${player.name.toUpperCase()}</h2>
            <p>¿Qué deseas hacer?</p>
            <div class="modal-options">
                <button class="option-btn" id="action-dorsal">Asignar Nuevo Dorsal</button>
                <button class="option-btn" id="action-pos-skill">Actualizar Posición y Skill</button>
            </div>`;
        this.renderModal(content);
        document.getElementById('action-dorsal').addEventListener('click', () => this.openNumberSelectionModal(player));
        document.getElementById('action-pos-skill').addEventListener('click', () => this.openPosSkillModal(player));
    },

    openNumberSelectionModal(player) {
        const formContent = `
            <h2>Asignar Nuevo Dorsal</h2>
            <form id="numberForm">
                <div class="form-group">
                    <label for="newNumber">Nuevo Número (1-99):</label>
                    <input type="number" id="newNumber" min="1" max="99" required value="${player.number_new || ''}">
                </div>
                <button type="submit" class="submit-btn">Guardar Número</button>
            </form>`;
        this.renderModal(formContent);
        document.getElementById('numberForm').addEventListener('submit', e => {
            e.preventDefault();
            const newNumber = parseInt(document.getElementById('newNumber').value);
            if (this.isNumberTaken(newNumber, player.id)) {
                return this.showNotification('Ese dorsal ya está en uso o solicitado. Elige otro.', 'error');
            }
            this.updatePlayer({ ...player, number_new: newNumber || null });
            this.closeModal();
        });
    },
    
    openPosSkillModal(player) {
        const formContent = `
            <h2>Actualizar ${player.name}</h2>
            <form id="posSkillForm">
                <div class="form-group"><label for="position">Posición:</label>${this.getSelectHTML('position', this.POSITIONS, player.position)}</div>
                <div class="form-group"><label for="skill">Skill Principal:</label>${this.getSelectHTML('skill', this.SKILLS, player.skill)}</div>
                <button type="submit" class="submit-btn">Guardar Cambios</button>
            </form>`;
        this.renderModal(formContent);
        document.getElementById('posSkillForm').addEventListener('submit', e => {
            e.preventDefault();
            const updatedPlayer = {
                ...player,
                position: document.getElementById('position').value,
                skill: document.getElementById('skill').value
            };
            this.updatePlayer(updatedPlayer);
            this.closeModal();
        });
    },

    openApplicationModal() {
        const content = `
            <h2>Postúlate al Equipo</h2>
            <form id="applicationForm">
                <div class="form-group"><label for="appName">Nombre:</label><input id="appName" type="text" required></div>
                <div class="form-group"><label for="appNumber">Número Deseado:</label><input id="appNumber" type="number" min="1" max="99" required></div>
                <div class="form-group"><label for="appPosition">Posición Principal:</label>${this.getSelectHTML('appPosition', this.POSITIONS)}</div>
                <div class="form-group"><label for="appSkill">Skill Principal:</label>${this.getSelectHTML('appSkill', this.SKILLS)}</div>
                <button class="submit-btn" type="submit">Enviar Solicitud</button>
            </form>`;
        this.renderModal(content);
        document.getElementById('applicationForm').addEventListener('submit', async e => {
            e.preventDefault();
            const newNumber = parseInt(document.getElementById('appNumber').value);
            if (this.isNumberTaken(newNumber)) {
                return this.showNotification('El número deseado ya está en uso. Elige otro.', 'error');
            }
            const payload = {
                name: document.getElementById('appName').value,
                number: newNumber,
                position: document.getElementById('appPosition').value,
                skill: document.getElementById('appSkill').value,
            };
            try {
                const { applications } = await this.apiCall('/api/data', 'POST', { type: 'application', payload });
                this.db.applications = applications;
                this.showNotification('¡Solicitud enviada con éxito!', 'success');
                this.closeModal();
                this.renderAll();
            } catch(error) {
                this.showNotification(error.message, 'error');
            }
        });
    },

    openStaffLoginModal() {
        const content = `
            <h2>Acceso Staff</h2>
            <form id="staffLoginForm">
                <div class="form-group"><label for="staffUser">Usuario:</label><input type="text" id="staffUser" autocomplete="username"></div>
                <div class="form-group"><label for="staffPass">Contraseña:</label><input type="password" id="staffPass" autocomplete="current-password"></div>
                <button class="submit-btn" type="submit">Iniciar Sesión</button>
            </form>`;
        this.renderModal(content);
        document.getElementById('staffLoginForm').addEventListener('submit', async e => {
            e.preventDefault();
            const payload = { user: document.getElementById('staffUser').value, pass: document.getElementById('staffPass').value };
            try {
                await this.apiCall('/api/data', 'POST', { type: 'staff_login', payload });
                this.state.isStaff = true;
                this.openStaffPanel();
            } catch (error) {
                this.showNotification(error.message, 'error');
            }
        });
    },

    openStaffPanel(renderBase = true) {
        const contentHTML = `
            <div class="staff-header">
                <h2>Panel de Administración</h2>
                <div class="header-actions">
                    <button class="action-btn-small" data-action="addPlayer">Añadir Jugador</button>
                    <button class="action-btn-small logout-btn" data-action="logoutStaff" aria-label="Cerrar Sesión de Staff">${this.icons.logout}</button>
                </div>
            </div>
            <div class="staff-tabs">
                <button class="tab-btn active" data-tab="players">Jugadores (${this.db.players.length})</button>
                <button class="tab-btn" data-tab="applications">Solicitudes (${this.db.applications.length})</button>
            </div>
            <div class="staff-content" id="staffContent"></div>`;
        
        if (renderBase) this.renderModal(contentHTML, true, 'staff-modal');
        
        this.renderStaffContent('players');

        document.querySelector('.staff-tabs').addEventListener('click', e => {
            if (e.target.matches('.tab-btn')) {
                document.querySelector('.staff-tabs .active')?.classList.remove('active');
                e.target.classList.add('active');
                this.renderStaffContent(e.target.dataset.tab);
            }
        });
    },

    openEditPlayerModal(playerId) {
        const isNew = playerId === null;
        const player = isNew ? { stats: {}, isExpelled: false } : this.db.players.find(p => p.id === parseInt(playerId));
        
        const modalContent = `
            <h2>${isNew ? 'Añadir Nuevo Jugador' : 'Editar a ' + player.name}</h2>
            <form id="editForm">
                <div class="form-grid">
                    <div class="form-group"><label>Nombre</label><input id="name" value="${player.name || ''}" required></div>
                    <div class="form-group"><label>Posición</label>${this.getSelectHTML('position', this.POSITIONS, player.position)}</div>
                    <div class="form-group"><label>Skill</label>${this.getSelectHTML('skill', this.SKILLS, player.skill)}</div>
                    <div class="form-group"><label>N° Actual</label><input id="num_current" type="number" value="${player.number_current || ''}"></div>
                    <div class="form-group"><label>N° Solicitado</label><input id="num_new" type="number" value="${player.number_new || ''}"></div>
                    <div class="form-group"><label>Goles</label><input id="stat_goles" type="number" value="${player.stats?.goles || 0}"></div>
                    <div class="form-group"><label>Partidos</label><input id="stat_partidos" type="number" value="${player.stats?.partidos || 0}"></div>
                    <div class="form-group"><label>Asistencias</label><input id="stat_asistencias" type="number" value="${player.stats?.asistencias || 0}"></div>
                </div>
                <div class="form-group checkbox-group"><input id="isExpelled" type="checkbox" ${player.isExpelled ? 'checked' : ''}><label for="isExpelled">Marcar como Expulsado</label></div>
                <button type="submit" class="submit-btn">${isNew ? 'Añadir al Plantel' : 'Guardar Cambios'}</button>
            </form>`;
        this.renderModal(modalContent, true);

        document.getElementById('editForm').addEventListener('submit', async e => {
            e.preventDefault();
            const num_current = parseInt(document.getElementById('num_current').value) || null;
            const num_new = parseInt(document.getElementById('num_new').value) || null;
            const idToCheck = isNew ? null : player.id;

            if (this.isNumberTaken(num_current, idToCheck) || this.isNumberTaken(num_new, idToCheck)) {
                return this.showNotification('Uno de los números ya está en uso. Verifícalo.', 'error');
            }
            
            const formPlayer = {
                id: player.id,
                name: document.getElementById('name').value,
                position: document.getElementById('position').value,
                skill: document.getElementById('skill').value,
                number_current: num_current,
                number_new: num_new,
                isExpelled: document.getElementById('isExpelled').checked,
                stats: {
                    goles: parseInt(document.getElementById('stat_goles').value) || 0,
                    partidos: parseInt(document.getElementById('stat_partidos').value) || 0,
                    asistencias: parseInt(document.getElementById('stat_asistencias').value) || 0,
                }
            };
            
            if (isNew) {
                // Para añadir, la API crea un nuevo jugador con los datos del formulario.
                await this.addPlayer(formPlayer);
            } else {
                await this.updatePlayer(formPlayer);
            }
            this.closeModal();
        });
    },

    // --- RENDERIZADO DEL PANEL DE STAFF ---

    renderStaffContent(tab) {
        const container = document.getElementById('staffContent');
        if (!container) return;
        container.innerHTML = (tab === 'players')
            ? this.getStaffPlayersHTML()
            : this.getStaffApplicationsHTML();
    },

    getStaffPlayersHTML() {
        const playersHTML = this.db.players.sort((a,b)=>a.name.localeCompare(b.name)).map(p => `
            <div class="staff-list-item" data-id="${p.id}">
                <div class="staff-player-info">
                    <strong>${p.name}</strong><br>
                    <span>${p.position || 'N/A'} / #${p.number_current || '--'} ${p.number_new ? `(Pide ${p.number_new})` : ''}</span>
                </div>
                <div class="staff-item-actions"><button class="action-btn-small" data-action="editPlayer" data-id="${p.id}">Editar</button></div>
            </div>`).join('');
        return `<div class="staff-list">${playersHTML}</div>`;
    },

    getStaffApplicationsHTML() {
        if(this.db.applications.length === 0) {
            return '<p style="padding: 1rem; text-align: center;">No hay solicitudes pendientes.</p>';
        }
        const appsHTML = this.db.applications.map(app => `
            <div class="staff-list-item application">
                <div>
                    <strong>${app.name}</strong><br>
                    <span>${app.position} / Pide #${app.number}</span>
                </div>
                <div class="staff-item-actions">
                    <button class="action-btn-small approve" data-action="approveApplication" data-id="${app.id}">Aprobar</button>
                    <button class="action-btn-small reject" data-action="rejectApplication" data-id="${app.id}">Rechazar</button>
                </div>
            </div>`).join('');
        return `<div class="staff-list">${appsHTML}</div>`;
    },
    
    // --- LÓGICA DE DATOS Y API ---

    async updatePlayer(updatedPlayer) {
        const originalPlayers = JSON.parse(JSON.stringify(this.db.players));
        const playerIndex = this.db.players.findIndex(p => p.id === updatedPlayer.id);
        if (playerIndex > -1) {
            this.db.players[playerIndex] = updatedPlayer;
            this.renderAll(); // Actualización optimista
        }

        try {
            const { players } = await this.apiCall('/api/data', 'PUT', { type: 'update_player', payload: updatedPlayer });
            this.db.players = players; // Sincronización final
            this.showNotification('Jugador actualizado.', 'success');
        } catch (e) {
            this.db.players = originalPlayers; // Revertir en caso de error
            this.showNotification(`Error al guardar: ${e.message}`, 'error');
        } finally {
            this.renderAll();
        }
    },

    async addPlayer(playerData) {
        try {
            // La API es responsable de asignar el ID. Omitimos `id: null`.
            const { id, ...payload } = playerData;
            const { players } = await this.apiCall('/api/data', 'PUT', { type: 'update_player', payload }); // Asumimos que la API maneja la creación si el ID no existe o se puede adaptar la API.
            this.db.players = players;
            this.showNotification('Jugador añadido.', 'success');
        } catch(e) {
            this.showNotification(`Error al añadir: ${e.message}`, 'error');
        }
    },

    async handleApplication(appId, isApproved) {
        const app = this.db.applications.find(a => a.id === parseInt(appId));
        if (!app) return;

        let newPlayerData = null;
        if (isApproved) {
            if (this.isNumberTaken(app.number)) {
                return this.showNotification('No se puede aprobar: El número ya está en uso.', 'error');
            }
            newPlayerData = {
                name: app.name, position: app.position, skill: app.skill,
                number_current: app.number, number_new: null, isExpelled: false,
                stats: { goles: 0, partidos: 0, asistencias: 0 }
            };
        }

        try {
            const { players, applications } = await this.apiCall('/api/data', 'DELETE', {
                type: 'process_application',
                payload: { appId: parseInt(appId), approved: isApproved, newPlayerData }
            });
            this.db.players = players;
            this.db.applications = applications;
            this.showNotification(`Solicitud ${isApproved ? 'aprobada' : 'rechazada'}.`, 'success');
        } catch (e) {
            this.showNotification(`Error al procesar: ${e.message}`, 'error');
        } finally {
            this.renderAll();
        }
    },

    async apiCall(url, method, body = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Ocurrió un error desconocido.');
        }
        return data;
    },

    // --- FUNCIONES UTILITARIAS ---

    isNumberTaken(number, excludePlayerId = null) {
        if (!number) return false;
        return this.db.players.some(p => {
            if (p.id === excludePlayerId) return false;
            return p.number_current === number || p.number_new === number;
        });
    },

    getSelectHTML(id, options, selectedValue = '') {
        const opts = options.map(opt => `<option value="${opt}" ${opt === selectedValue ? 'selected' : ''}>${opt}</option>`).join('');
        return `<select id="${id}">${opts}</select>`;
    },
    
    renderModal(contentHTML, isLarge = false, customClass = '') {
        const modalTemplate = `
            <div class="modal-overlay">
                <div class="modal-content ${isLarge ? 'large' : ''} ${customClass}">
                    <button class="close-btn">&times;</button>
                    ${contentHTML}
                </div>
            </div>`;
        this.elements.modalContainer.innerHTML = modalTemplate;
        
        const overlay = this.elements.modalContainer.querySelector('.modal-overlay');
        setTimeout(() => overlay.classList.add('show'), 10);
        
        overlay.addEventListener('click', e => {
            if (e.target === overlay || e.target.closest('.close-btn')) {
                this.closeModal();
            }
        });
    },

    closeModal() {
        const overlay = this.elements.modalContainer.querySelector('.modal-overlay');
        if (overlay) {
            overlay.classList.remove('show');
            overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        }
    },

    showNotification(message, type = 'info', duration = 5000) {
        const el = document.createElement('div');
        el.className = `notification ${type}`;
        
        const text = document.createElement('p');
        text.textContent = message;
        
        const progressBar = document.createElement('div');
        progressBar.className = 'notification-progress';
        progressBar.style.animationDuration = `${duration / 1000}s`;

        el.appendChild(text);
        el.appendChild(progressBar);

        const dismiss = () => {
            if (!el.parentElement) return;
            el.classList.add('hiding');
            el.addEventListener('transitionend', () => el.remove(), { once: true });
        };

        const timeoutId = setTimeout(dismiss, duration);

        el.addEventListener('click', () => {
            clearTimeout(timeoutId);
            dismiss();
        }, { once: true });

        this.elements.notificationContainer.appendChild(el);
    },

    setCookie(name, value, days) {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
    },

    getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) == ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    },

    eraseCookie(name) {
        document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    }
};

// Iniciar la aplicación cuando el DOM esté listo.
document.addEventListener('DOMContentLoaded', () => App.init());
