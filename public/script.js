// script.js COMPLETO Y FUNCIONAL

const App = {
  db: { players: [], applications: [] },
  state: { loggedInPlayerId: null, isSpectator: false },
  elements: {},

  init() {
    this.cacheElements();
    this.setupEventListeners();
    this.loadData();
  },

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
      mainSubtitle: document.getElementById('main-subtitle')
    };
  },

  setupEventListeners() {
    this.elements.staffBtn?.addEventListener('click', () => this.openStaffLoginModal?.());

    this.elements.roleSelectionScreen?.addEventListener('click', e => {
      const button = e.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'player-login') this.openLoginModal?.();
      if (action === 'spectator-login') this.enterAsSpectator();
    });

    this.elements.notificationContainer?.addEventListener('click', e => {
      const notif = e.target.closest('.notification');
      if (notif) notif.remove();
    });

    document.body.addEventListener('click', e => {
      const notif = e.target.closest('.notification');
      if (notif) notif.remove();
    });

    this.elements.playersGrid?.addEventListener('click', e => {
      const card = e.target.closest('.fifa-card');
      if (!card || this.state.isSpectator) return;
      const id = parseInt(card.dataset.id);
      if (id === this.state.loggedInPlayerId) this.openPlayerEditModal(id);
      else this.showNotification('Solo puedes editar tu propia ficha.', 'info');
    });

    document.body.addEventListener('click', e => {
      const editBtn = e.target.closest('[data-action="editPlayer"]');
      if (!editBtn) return;
      const playerId = parseInt(editBtn.dataset.id);
      this.openStaffEditPlayerModal(playerId);
    });
  },

  async loadData() {
    try {
      const res = await fetch('/api/data');
      const data = await res.json();
      this.db.players = data.players || [];
      this.db.applications = data.applications || [];
      this.renderAll();
    } catch (e) {
      this.showNotification('No se pudo cargar la base de datos', 'error');
    }
  },

  renderAll() {
    this.renderPlayerCards();
    this.renderSummaryTable();
  },

  renderPlayerCards() {
    const grid = this.elements.playersGrid;
    grid.innerHTML = '';
    this.db.players.forEach(player => {
      const card = document.createElement('div');
      card.className = 'fifa-card';
      if (player.id === this.state.loggedInPlayerId) card.classList.add('is-current-user');
      if (player.isExpelled) card.classList.add('is-expelled');
      card.dataset.id = player.id;
      card.innerHTML = `
        <div class="card-top">
          <span class="player-skill">${player.skill || 'Sin Skill'}</span>
        </div>
        <div class="card-jersey-container">
          <div class="jersey-svg"></div>
        </div>
        <div class="card-bottom">
          <h3 class="player-name">${player.name}</h3>
          <p class="player-position">${player.position}</p>
          <div class="player-numbers-display">
            ${player.number_current ? '#' + player.number_current : '--'}
            ${player.number_new ? `<span class="new-number-tag">(Nuevo: ${player.number_new})</span>` : ''}
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  },

  renderSummaryTable() {
    const body = this.elements.summaryBody;
    const playersSorted = [...this.db.players].sort((a, b) => (b.stats?.goles || 0) - (a.stats?.goles || 0));
    body.innerHTML = playersSorted.map(p => `
      <div class="summary-row">
        <div>${p.name}</div>
        <div>${p.position || 'N/A'}</div>
        <div>${p.skill || 'N/A'}</div>
        <div class="goals">${p.stats?.goles || 0}</div>
        <div>${p.number_current || '--'}</div>
        <div>${p.number_new || '--'}</div>
      </div>
    `).join('');
  },

  openStaffEditPlayerModal(id) {
    const player = this.db.players.find(p => p.id === id);
    if (!player) return;

    const content = `
      <div class="modal-overlay show">
        <div class="modal-content">
          <h2>Editar Jugador (Staff) - ${player.name}</h2>
          <form id="staffEditForm">
            <label>Nombre:
              <input type="text" id="staff-name" value="${player.name}" required />
            </label>
            <label>Posición:
              <input type="text" id="staff-position" value="${player.position}" required />
            </label>
            <label>Skill:
              <input type="text" id="staff-skill" value="${player.skill}" required />
            </label>
            <label>Dorsal Actual:
              <input type="number" id="staff-num-current" value="${player.number_current || ''}" min="1" max="99" />
            </label>
            <label>Dorsal Nuevo:
              <input type="number" id="staff-num-new" value="${player.number_new || ''}" min="1" max="99" />
            </label>
            <label>Goles:
              <input type="number" id="staff-goals" value="${player.stats?.goles || 0}" min="0" />
            </label>
            <label>Partidos:
              <input type="number" id="staff-matches" value="${player.stats?.partidos || 0}" min="0" />
            </label>
            <label>Asistencias:
              <input type="number" id="staff-assists" value="${player.stats?.asistencias || 0}" min="0" />
            </label>
            <label>
              <input type="checkbox" id="staff-expelled" ${player.isExpelled ? 'checked' : ''} /> Expulsado
            </label>
            <button type="submit">Guardar Cambios</button>
          </form>
        </div>
      </div>
    `;

    this.elements.modalContainer.innerHTML = content;

    document.getElementById('staffEditForm').addEventListener('submit', e => {
      e.preventDefault();

      const num_current = parseInt(document.getElementById('staff-num-current').value);
      const num_new = parseInt(document.getElementById('staff-num-new').value);

      if (this.isNumberTaken(num_current, player.id)) {
        this.showNotification(`El dorsal actual ${num_current} ya está en uso.`, 'error');
        return;
      }
      if (this.isNumberTaken(num_new, player.id)) {
        this.showNotification(`El dorsal nuevo ${num_new} ya está en uso.`, 'error');
        return;
      }

      const updated = {
        ...player,
        name: document.getElementById('staff-name').value,
        position: document.getElementById('staff-position').value,
        skill: document.getElementById('staff-skill').value,
        number_current: isNaN(num_current) ? null : num_current,
        number_new: isNaN(num_new) ? null : num_new,
        isExpelled: document.getElementById('staff-expelled').checked,
        stats: {
          goles: parseInt(document.getElementById('staff-goals').value) || 0,
          partidos: parseInt(document.getElementById('staff-matches').value) || 0,
          asistencias: parseInt(document.getElementById('staff-assists').value) || 0
        }
      };

      this.updatePlayer(updated);
      this.elements.modalContainer.innerHTML = '';
    });
  },

  async updatePlayer(playerData) {
    const index = this.db.players.findIndex(p => p.id === playerData.id);
    if (index !== -1) {
      this.db.players[index] = playerData;
      this.renderAll();
      try {
        const res = await fetch('/api/data', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'players', payload: this.db.players })
        });
        if (!res.ok) throw new Error('No se pudo guardar en KV');
        this.showNotification('Jugador actualizado con éxito', 'success');
      } catch (err) {
        this.showNotification('Error al guardar jugador', 'error');
      }
    }
  },

  isNumberTaken(number, excludeId) {
    if (!number) return false;
    return this.db.players.some(p => {
      if (p.id === excludeId) return false;
      return p.number_current === number || p.number_new === number;
    });
  },

  showNotification(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.textContent = message;
    this.elements.notificationContainer.appendChild(el);
    setTimeout(() => {
      if (el && el.parentElement) el.remove();
    }, 5000);
  },

  setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/`;
  },

  getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  },

  eraseCookie(name) {
    document.cookie = `${name}=; Max-Age=0; path=/`;
  }
};

App.init();
