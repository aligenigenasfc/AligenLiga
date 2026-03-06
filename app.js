/* ═══════════════════════════════════════════════════════
   AlienígenasFC — Aplicação Principal
   Firebase Auth + Firestore + PWA
   ═══════════════════════════════════════════════════════ */

// ───── CONSTANTS ─────
const STORAGE_KEY = 'torneio_futebol'; // localStorage fallback
// Times padrão com imagens de mascote
const DEFAULT_TEAMS = [
    { name: 'Verde',      hex: '#4CAF50', imgLeft: 'teams/verde-left.png',      imgRight: 'teams/verde-right.png' },
    { name: 'Amarelo',    hex: '#FFC107', imgLeft: 'teams/amarelo-left.png',    imgRight: 'teams/amarelo-right.png' },
    { name: 'Azul SSW',   hex: '#1565C0', imgLeft: 'teams/azulssw-left.png',    imgRight: 'teams/azulssw-right.png' },
    { name: 'Azul Claro', hex: '#81D4FA', imgLeft: 'teams/azulclaro-left.png',  imgRight: 'teams/azulclaro-right.png' },
];

// Cores extras para times personalizados
const EXTRA_COLORS = [
    { name: 'Vermelho', hex: '#f44336' },
    { name: 'Branco', hex: '#e0e0e0' },
    { name: 'Laranja', hex: '#FF9800' },
    { name: 'Roxo', hex: '#9C27B0' },
    { name: 'Rosa', hex: '#E91E63' },
];

// All available colors (for color picker)
const ALL_COLORS = [...DEFAULT_TEAMS.map(t => ({ name: t.name, hex: t.hex })), ...EXTRA_COLORS];
const TOTAL_ROUNDS = 9;
const WIN_PTS = 3;
const DRAW_PTS = 1;
const LOSS_PTS = 0;

// ───── MATCH TIMER ─────
let matchTimerInterval = null;

// ───── ROLE DEFINITIONS ─────
const ROLES = {
    admin:   { label: 'Admin Geral', icon: '👑' },
    captain: { label: 'Capitão',     icon: '🎖️' },
    user:    { label: 'Usuário',     icon: '👤' },
};

// ───── AUTH STATE ─────
let currentUser = null; // { uid, email, displayName, role }

/** Load user profile from Firestore */
async function loadUserProfile(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        if (doc.exists) return doc.data();
    } catch (e) { console.error('Erro ao carregar perfil:', e); }
    return null;
}

/** Firebase Auth: sign in with email/password */
async function doLogin(email, password) {
    try {
        await auth.signInWithEmailAndPassword(email, password);
        return { success: true };
    } catch (e) {
        console.error('Login error:', e);
        let msg = 'E-mail ou senha incorretos.';
        if (e.code === 'auth/user-not-found') msg = 'Usuário não encontrado.';
        else if (e.code === 'auth/wrong-password') msg = 'Senha incorreta.';
        else if (e.code === 'auth/invalid-email') msg = 'E-mail inválido.';
        else if (e.code === 'auth/too-many-requests') msg = 'Muitas tentativas. Aguarde um momento.';
        else if (e.code === 'auth/network-request-failed') msg = 'Sem conexão com a internet.';
        else if (e.code === 'auth/invalid-credential') msg = 'E-mail ou senha incorretos.';
        return { success: false, message: msg };
    }
}

/** Firebase Auth: sign in with Google */
function getGoogleAuthErrorMessage(e) {
    const code = e?.code || '';
    const host = window.location.hostname || 'domínio atual';

    if (code === 'auth/popup-closed-by-user') return 'Login cancelado.';
    if (code === 'auth/network-request-failed') return 'Sem conexão com a internet.';
    if (code === 'auth/operation-not-allowed') return 'Login com Google não está ativado no Firebase. Ative em Authentication > Sign-in method > Google.';
    if (code === 'auth/unauthorized-domain') return `Domínio não autorizado no Firebase: ${host}. Adicione este domínio em Authentication > Settings > Authorized domains.`;
    if (code === 'auth/invalid-api-key') return 'Configuração Firebase inválida (API Key). Verifique o arquivo firebase-config.js.';
    if (code === 'auth/app-not-authorized') return 'Aplicação não autorizada para autenticação Google. Verifique OAuth e domínios autorizados no Firebase.';

    return 'Erro ao entrar com Google.';
}

async function doGoogleLogin() {
    try {
        await auth.signInWithPopup(googleProvider);
        return { success: true };
    } catch (e) {
        console.error('Google login error:', e);

        // Silently ignore duplicate popup requests
        if (e.code === 'auth/cancelled-popup-request') return { success: false, message: '' };

        // Fallback for popup issues (common on mobile and strict browsers)
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/web-storage-unsupported') {
            try {
                await auth.signInWithRedirect(googleProvider);
                return { success: true, redirected: true };
            } catch (redirectErr) {
                console.error('Google redirect login error:', redirectErr);
                return { success: false, message: getGoogleAuthErrorMessage(redirectErr) };
            }
        }

        return { success: false, message: getGoogleAuthErrorMessage(e) };
    }
}

/** Firebase Auth: sign out */
function logout() {
    auth.signOut();
    // onAuthStateChanged will handle UI update
}

// ───── PERMISSION HELPERS ─────
function hasRole(role) {
    return currentUser && currentUser.role === role;
}

function isAdmin() { return hasRole('admin'); }
function isCaptain() { return hasRole('captain'); }
function isUser() { return hasRole('user'); }

function canManagePlayers() { return isAdmin(); }
function canCreateTournament() { return isAdmin(); }
function canEditFinishedMatches() { return isAdmin(); }
function canChangeTeams() { return isAdmin(); }

function canStartTournamentAction() { return isAdmin() || isCaptain(); }
function canAssignPlayers() { return isAdmin() || isCaptain(); }
function canScoreGoals() { return isAdmin() || isCaptain(); }
function canSetGoalkeepers() { return isAdmin() || isCaptain(); }
function canEndMatch() { return isAdmin() || isCaptain(); }
function canResetTournament() { return isAdmin(); }

function canManageUsers() { return isAdmin(); }

// ───── LOGIN/LOGOUT UI ─────
function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-header').classList.add('hidden');
    document.getElementById('main-content').classList.add('hidden');
    document.getElementById('bottom-nav').classList.add('hidden');
    document.getElementById('login-error').classList.add('hidden');
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-email').focus();
}

function showAppScreen() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-header').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    document.getElementById('bottom-nav').classList.remove('hidden');
    updateHeaderUserInfo();
    applyPermissionsToUI();
    renderCurrentView();
}

function updateHeaderUserInfo() {
    if (!currentUser) return;
    const roleBadge = document.getElementById('header-user-role');
    const role = ROLES[currentUser.role] || ROLES.user;
    const displayName = currentUser.displayName || currentUser.email.split('@')[0];
    roleBadge.textContent = `${role.icon} ${displayName}`;
    roleBadge.className = 'user-role-badge role-' + currentUser.role;
}

function applyPermissionsToUI() {
    const adminBtn = document.getElementById('nav-admin-btn');
    if (adminBtn) {
        if (isAdmin()) {
            adminBtn.classList.add('visible');
        } else {
            adminBtn.classList.remove('visible');
        }
    }

    const playerAddArea = document.getElementById('player-add-area');
    if (playerAddArea) {
        playerAddArea.style.display = canManagePlayers() ? '' : 'none';
    }
}

// ───── STATE ─────
let state = {
    players: [],
    currentTournament: null,
    history: []
};

// ───── PERSISTENCE (FIRESTORE + localStorage fallback) ─────

/** Load state from Firestore (with localStorage fallback) */
async function loadState() {
    try {
        // Players
        const stateDoc = await db.collection('appData').doc('state').get();
        if (stateDoc.exists) {
            state.players = stateDoc.data().players || [];
            // migration: ensure isGoalkeeper field
            state.players.forEach(p => {
                if (p.isGoalkeeper === undefined) {
                    p.isGoalkeeper = false;
                }
            });
        }

        // Tournament
        const tournDoc = await db.collection('appData').doc('tournament').get();
        if (tournDoc.exists && tournDoc.data().data) {
            state.currentTournament = tournDoc.data().data;
            // migration: ensure goalkeepers field
            if (state.currentTournament?.matches) {
                state.currentTournament.matches.forEach(m => {
                    if (!m.homeGoalkeeper) m.homeGoalkeeper = null;
                    if (!m.awayGoalkeeper) m.awayGoalkeeper = null;
                    // migration: ensure timer fields
                    if (m.timerDuration === undefined) m.timerDuration = 600; // 10 minutes
                    if (m.timerRemaining === undefined) m.timerRemaining = 600;
                    if (m.timerRunning === undefined) m.timerRunning = false;
                    if (m.timerStartedAt === undefined) m.timerStartedAt = null;
                });
            }
            // migration: ensure designatedGoalkeeperId field in teams
            if (state.currentTournament?.teams) {
                state.currentTournament.teams.forEach(team => {
                    if (team.designatedGoalkeeperId === undefined) {
                        team.designatedGoalkeeperId = null;
                    }
                });
            }
        } else {
            state.currentTournament = null;
        }

        // History
        const histSnap = await db.collection('history').orderBy('finishedAt', 'desc').get();
        state.history = histSnap.docs.map(d => ({ _firestoreId: d.id, ...d.data() }));

        // Also cache to localStorage
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}

    } catch (e) {
        console.error('Erro ao carregar do Firestore, usando localStorage:', e);
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const s = JSON.parse(saved);
                state.players = s.players || [];
                state.currentTournament = s.currentTournament || null;
                state.history = s.history || [];
            }
        } catch (e2) { console.error('Fallback localStorage falhou:', e2); }
    }
}

/**
 * Save state to Firestore (fire-and-forget with offline persistence).
 * Also saves to localStorage as fallback.
 */
function saveState() {
    // Firestore — fire and forget (offline persistence handles sync)
    db.collection('appData').doc('state').set({
        players: state.players,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(e => console.error('Erro ao salvar players:', e));

    db.collection('appData').doc('tournament').set({
        data: state.currentTournament,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(e => console.error('Erro ao salvar tournament:', e));

    // localStorage fallback
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
}

/** Migrate localStorage data to Firestore (runs once on first login) */
async function migrateLocalStorageToFirestore() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        const data = JSON.parse(saved);
        if (!data.players?.length && !data.currentTournament && !data.history?.length) return;

        // Check if Firestore already has players data
        const stateDoc = await db.collection('appData').doc('state').get();
        if (stateDoc.exists && stateDoc.data().players?.length > 0) return; // Already has data

        // Migrate
        if (data.players?.length) {
            await db.collection('appData').doc('state').set({ players: data.players });
        }
        if (data.currentTournament) {
            await db.collection('appData').doc('tournament').set({ data: data.currentTournament });
        }
        if (data.history?.length) {
            for (const h of data.history) {
                await db.collection('history').add(h);
            }
        }
        showToast('📦 Dados locais migrados para a nuvem!');
    } catch (e) {
        console.error('Erro na migração:', e);
    }
}

// ───── REALTIME SYNC ─────
let _tournamentUnsubscribe = null;

function startRealtimeSync() {
    // Listen for tournament changes in real-time
    _tournamentUnsubscribe = db.collection('appData').doc('tournament').onSnapshot(doc => {
        if (!doc.exists) return;
        const data = doc.data().data;
        // Only update if different (avoid loops)
        const newJson = JSON.stringify(data);
        const curJson = JSON.stringify(state.currentTournament);
        if (newJson !== curJson) {
            state.currentTournament = data;
            // Re-render if on a relevant view
            if (['matches', 'standings', 'stats'].includes(currentView)) {
                renderCurrentView();
            }
        }
    }, err => {
        console.warn('Realtime sync error:', err);
    });

    // Listen for players changes
    db.collection('appData').doc('state').onSnapshot(doc => {
        if (!doc.exists) return;
        const players = doc.data().players || [];
        if (JSON.stringify(players) !== JSON.stringify(state.players)) {
            state.players = players;
            if (currentView === 'players') renderCurrentView();
        }
    }, err => {
        console.warn('Realtime sync (players) error:', err);
    });
}

function stopRealtimeSync() {
    if (_tournamentUnsubscribe) {
        _tournamentUnsubscribe();
        _tournamentUnsubscribe = null;
    }
}

// ───── UTILS ─────
let _idCounter = Date.now();
function uid() { return (++_idCounter).toString(36); }

function getPlayerName(playerId) {
    const p = state.players.find(x => x.id === playerId);
    return p ? p.name : '???';
}

function getTeam(teamId) {
    if (!state.currentTournament) return null;
    return state.currentTournament.teams.find(t => t.id === teamId);
}

function getTeamName(teamId) {
    const t = getTeam(teamId);
    return t ? t.name : '???';
}

function getTeamColor(teamId) {
    const t = getTeam(teamId);
    return t ? t.color : '#888';
}

function showToast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

// ───── VIEW MANAGEMENT ─────
let currentView = 'stats';

function switchView(viewName) {
    // Block admin view for non-admins
    if (viewName === 'admin' && !isAdmin()) return;
    currentView = viewName;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const view = document.getElementById(`view-${viewName}`);
    if (view) view.classList.add('active');
    const btn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
    if (btn) btn.classList.add('active');
    renderCurrentView();
}

function renderCurrentView() {
    switch (currentView) {
        case 'players': renderPlayers(); break;
        case 'tournament': renderTournament(); break;
        case 'matches': renderMatches(); break;
        case 'standings': renderStandings(); break;
        case 'stats': renderStats(); break;
        case 'admin': renderAdmin(); break;
    }
}

// ═══════════════════════════════════════════════════
// PLAYER MANAGEMENT
// ═══════════════════════════════════════════════════
function addPlayer(name) {
    if (!canManagePlayers()) { showToast('Sem permissão!'); return; }
    name = name.trim();
    if (!name) return;
    if (state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        showToast('Jogador já cadastrado!');
        return;
    }
    state.players.push({ id: uid(), name, isGoalkeeper: false });
    saveState();
    renderPlayers();
}

function removePlayer(id) {
    if (!canManagePlayers()) { showToast('Sem permissão!'); return; }
    // Can't remove if in active tournament
    if (state.currentTournament) {
        const t = state.currentTournament;
        const inUse = t.teams.some(team => team.players.includes(id));
        if (inUse) {
            showToast('Jogador está no torneio ativo!');
            return;
        }
    }
    state.players = state.players.filter(p => p.id !== id);
    saveState();
    renderPlayers();
}

function togglePlayerGoalkeeper(id) {
    if (!canManagePlayers()) { showToast('Sem permissão!'); return; }
    const player = state.players.find(p => p.id === id);
    if (player) {
        player.isGoalkeeper = !player.isGoalkeeper;
        saveState();
        renderPlayers();
    }
}

function renderPlayers() {
    const countEl = document.getElementById('player-count');
    const listEl = document.getElementById('player-list');
    countEl.textContent = `${state.players.length} jogador${state.players.length !== 1 ? 'es' : ''} cadastrado${state.players.length !== 1 ? 's' : ''}`;

    if (state.players.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👥</div>
                <div class="empty-state-text">Nenhum jogador cadastrado.<br>Adicione os jogadores acima.</div>
            </div>`;
        return;
    }

    listEl.innerHTML = state.players
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => `
            <li>
                <span class="player-name">${esc(p.name)} ${p.isGoalkeeper ? '🧤' : ''}</span>
                ${canManagePlayers() ? `
                    <div style="display:flex;gap:6px;align-items:center;">
                        <button class="btn-toggle-gk" onclick="togglePlayerGoalkeeper('${p.id}')" title="${p.isGoalkeeper ? 'Remover marca de goleiro' : 'Marcar como goleiro'}" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:${p.isGoalkeeper ? 'var(--accent)' : 'var(--bg-input)'};color:${p.isGoalkeeper ? '#fff' : 'var(--text-secondary)'};font-size:0.8rem;cursor:pointer;">🧤</button>
                        <button class="btn-remove" onclick="removePlayer('${p.id}')" title="Remover">✕</button>
                    </div>
                ` : ''}
            </li>
        `).join('');
}

// ═══════════════════════════════════════════════════
// TOURNAMENT MANAGEMENT
// ═══════════════════════════════════════════════════
function createTournament() {
    if (!canCreateTournament()) { showToast('Sem permissão!'); return; }
    if (state.players.length < 3) {
        showToast('Cadastre ao menos 3 jogadores primeiro!');
        return;
    }
    state.currentTournament = {
        id: uid(),
        createdAt: new Date().toISOString(),
        status: 'setup', // setup → scheduling → in_progress → finished
        teams: [
            { id: uid(), name: DEFAULT_TEAMS[0].name, color: DEFAULT_TEAMS[0].hex, imgLeft: DEFAULT_TEAMS[0].imgLeft, imgRight: DEFAULT_TEAMS[0].imgRight, players: [], designatedGoalkeeperId: null },
            { id: uid(), name: DEFAULT_TEAMS[1].name, color: DEFAULT_TEAMS[1].hex, imgLeft: DEFAULT_TEAMS[1].imgLeft, imgRight: DEFAULT_TEAMS[1].imgRight, players: [], designatedGoalkeeperId: null },
            { id: uid(), name: DEFAULT_TEAMS[2].name, color: DEFAULT_TEAMS[2].hex, imgLeft: DEFAULT_TEAMS[2].imgLeft, imgRight: DEFAULT_TEAMS[2].imgRight, players: [], designatedGoalkeeperId: null },
        ],
        matches: [],
        // scheduling state
        match1Selection: { home: null, away: null },
        stayTeam: null,       // team that stays after match 1 (winner or chosen on draw)
        leavingTeam: null,     // team that leaves after match 1
        restingTeam: null,     // team that rested during match 1
        scheduleGenerated: false,
    };
    saveState();
    renderTournament();
}

function resetTournament() {
    if (!canResetTournament()) { showToast('Sem permissão!'); return; }
    if (!state.currentTournament) return;
    // Save to history if there were matches played
    const t = state.currentTournament;
    if (t.matches.some(m => m.status === 'finished')) {
        state.history.push({ ...t, status: 'abandoned' });
    }
    state.currentTournament = null;
    saveState();
    renderTournament();
}

function setTeamName(teamId, name) {
    if (!canChangeTeams()) { showToast('Sem permissão!'); return; }
    const team = getTeam(teamId);
    if (team) {
        team.name = name;
        saveState();
    }
}

function setTeamColor(teamId, color) {
    if (!canChangeTeams()) { showToast('Sem permissão!'); return; }
    const team = getTeam(teamId);
    if (team) {
        team.color = color;
        // Check if this color matches a preset team and update images
        const preset = DEFAULT_TEAMS.find(t => t.hex === color);
        if (preset) {
            team.imgLeft = preset.imgLeft;
            team.imgRight = preset.imgRight;
        }
        saveState();
        renderTournament();
    }
}

function setTeamPreset(teamId, presetIndex) {
    if (!canChangeTeams()) { showToast('Sem permissão!'); return; }
    const team = getTeam(teamId);
    const preset = DEFAULT_TEAMS[presetIndex];
    if (team && preset) {
        team.name = preset.name;
        team.color = preset.hex;
        team.imgLeft = preset.imgLeft;
        team.imgRight = preset.imgRight;
        saveState();
        renderTournament();
    }
}

function assignPlayerToTeam(playerId, teamId) {
    if (!canAssignPlayers()) { showToast('Sem permissão!'); return; }
    const t = state.currentTournament;
    if (!t) return;
    // Remove from any other team first
    t.teams.forEach(team => {
        team.players = team.players.filter(id => id !== playerId);
    });
    // Add to target team
    const team = getTeam(teamId);
    if (team && !team.players.includes(playerId)) {
        team.players.push(playerId);
    }
    saveState();
    renderTournament();
}

function removePlayerFromTeam(playerId, teamId) {
    if (!canAssignPlayers()) { showToast('Sem permissão!'); return; }
    const team = getTeam(teamId);
    if (team) {
        team.players = team.players.filter(id => id !== playerId);
        // If the removed player was the designated goalkeeper, clear it
        if (team.designatedGoalkeeperId === playerId) {
            team.designatedGoalkeeperId = null;
        }
        saveState();
        renderTournament();
    }
}

function setTeamDesignatedGoalkeeper(teamId, playerId) {
    if (!canAssignPlayers()) { showToast('Sem permissão!'); return; }
    const team = getTeam(teamId);
    if (team) {
        team.designatedGoalkeeperId = playerId || null;
        saveState();
        renderTournament();
    }
}

function canStartTournament() {
    const t = state.currentTournament;
    if (!t) return false;
    // Each team must have at least 1 player
    return t.teams.every(team => team.players.length >= 1);
}

function startTournament() {
    if (!canStartTournamentAction()) { showToast('Sem permissão!'); return; }
    if (!canStartTournament()) {
        showToast('Cada time precisa de pelo menos 1 jogador!');
        return;
    }
    state.currentTournament.status = 'scheduling';
    saveState();
    switchView('matches');
}

function renderTournament() {
    const container = document.getElementById('tournament-content');
    const t = state.currentTournament;

    if (!t) {
        container.innerHTML = `
            <div class="view-header">
                <h2>🏆 Torneio</h2>
                <p class="view-subtitle">Configure um novo torneio semanal</p>
            </div>
            <div class="empty-state">
                <div class="empty-state-icon">🏆</div>
                <div class="empty-state-text">Nenhum torneio ativo.<br>${canCreateTournament() ? 'Crie um novo para começar!' : 'Aguarde o admin criar um torneio.'}</div>
            </div>
            <br>
            ${canCreateTournament() ? `
            <button class="btn btn-gold btn-block btn-lg" onclick="createTournament()">
                🏆 Novo Torneio
            </button>` : ''}
            ${state.history.length > 0 ? renderHistorySection() : ''}
        `;
        return;
    }

    if (t.status === 'setup') {
        renderTournamentSetup(container);
    } else {
        container.innerHTML = `
            <div class="view-header">
                <h2>🏆 Torneio em Andamento</h2>
            </div>
            <div class="notice notice-info">
                ⚽ O torneio está em andamento. Vá para <strong>Partidas</strong> para continuar.
            </div>
            <button class="btn btn-secondary btn-block" onclick="switchView('matches')">
                Ir para Partidas
            </button>
            ${canResetTournament() ? `
            <div class="divider"></div>
            <button class="btn btn-danger btn-block btn-sm" onclick="confirmResetTournament()">
                Encerrar Torneio
            </button>` : ''}
        `;
    }
}

function renderHistorySection() {
    return `
        <div class="divider"></div>
        <div class="stats-section">
            <h3>📜 Histórico</h3>
            ${state.history.slice(-5).reverse().map(h => `
                <div class="card" style="padding:10px 14px;margin-bottom:6px;">
                    <small style="color:var(--text-muted)">${new Date(h.createdAt).toLocaleDateString('pt-BR')}</small>
                    <div style="font-weight:600;font-size:0.85rem;">
                        ${h.teams.map(t => t.name).join(' × ')}
                        ${h.status === 'finished' ? ' ✅' : ' ⚠️ Abandonado'}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function confirmResetTournament() {
    showModal(`
        <div class="modal-title">⚠️ Encerrar Torneio?</div>
        <p style="text-align:center;color:var(--text-secondary);margin-bottom:16px;">
            Todos os dados do torneio atual serão salvos no histórico e um novo poderá ser criado.
        </p>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
            <button class="btn btn-danger" onclick="resetTournament();hideModal();renderTournament();">Encerrar</button>
        </div>
    `);
}

function renderTournamentSetup(container) {
    const t = state.currentTournament;
    const allAssigned = new Set();
    t.teams.forEach(team => team.players.forEach(pid => allAssigned.add(pid)));
    const unassigned = state.players.filter(p => !allAssigned.has(p.id));
    const canEdit = canAssignPlayers();
    const canChangeName = canChangeTeams();

    container.innerHTML = `
        <div class="view-header">
            <h2>🏆 Configurar Torneio</h2>
            <p class="view-subtitle">Monte os 3 times e distribua os jogadores</p>
        </div>

        ${t.teams.map((team, i) => `
            <div class="card team-card" style="border-left-color:${team.color}">
                <div class="team-header">
                    ${team.imgRight ? `<img src="${team.imgRight}" alt="${esc(team.name)}" class="team-card-avatar">` : `<div class="team-color-dot" style="background:${team.color}"></div>`}
                    ${canChangeName ? `
                    <input type="text" class="team-name-input" value="${esc(team.name)}"
                        onchange="setTeamName('${team.id}', this.value)"
                        style="background:transparent;border:none;color:var(--text-primary);padding:4px;">
                    ` : `<span style="font-weight:600;">${esc(team.name)}</span>`}
                </div>
                ${canChangeName ? `
                <div class="team-preset-selector">
                    <span style="font-size:0.75rem;color:var(--text-muted);">Time:</span>
                    ${DEFAULT_TEAMS.map((dt, dtIdx) => `
                        <button class="team-preset-btn ${team.color === dt.hex ? 'active' : ''}"
                                style="border-color:${dt.hex}"
                                onclick="setTeamPreset('${team.id}', ${dtIdx})"
                                title="${dt.name}">
                            <img src="${dt.imgRight}" alt="${dt.name}" class="team-preset-img">
                        </button>
                    `).join('')}
                </div>
                <div class="color-options">
                    ${ALL_COLORS.map(c => `
                        <div class="color-option ${team.color === c.hex ? 'selected' : ''}"
                             style="background:${c.hex}"
                             onclick="setTeamColor('${team.id}', '${c.hex}')"
                             title="${c.name}"></div>
                    `).join('')}
                </div>` : ''}
                <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px;">
                    Jogadores (${team.players.length}):
                </div>
                <ul class="team-players-list">
                    ${team.players.length === 0 ? '<li style="color:var(--text-muted);font-style:italic;">Nenhum jogador</li>' : ''}
                    ${team.players.map(pid => `
                        <li>
                            <span>${esc(getPlayerName(pid))} ${team.designatedGoalkeeperId === pid ? '🧤' : ''}</span>
                            ${canEdit ? `<button class="btn-remove" onclick="removePlayerFromTeam('${pid}','${team.id}')" title="Remover">✕</button>` : ''}
                        </li>
                    `).join('')}
                </ul>
                ${canEdit && team.players.length > 0 ? `
                    <div style="margin-top:8px;">
                        <select onchange="setTeamDesignatedGoalkeeper('${team.id}', this.value)" style="font-size:0.85rem;width:100%;">
                            <option value="">🧤 Designar goleiro do time...</option>
                            ${team.players.map(pid => `
                                <option value="${pid}" ${team.designatedGoalkeeperId === pid ? 'selected' : ''}>
                                    🧤 ${esc(getPlayerName(pid))}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                ` : ''}
                ${canEdit && (unassigned.length > 0 || team.players.length === 0) ? `
                    <div style="margin-top:8px;">
                        <select onchange="if(this.value)assignPlayerToTeam(this.value,'${team.id}');this.value='';">
                            <option value="">+ Adicionar jogador...</option>
                            ${unassigned.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
                        </select>
                    </div>
                ` : ''}
            </div>
        `).join('')}

        ${unassigned.length > 0 ? `
            <div class="notice notice-warning">
                ⚠️ ${unassigned.length} jogador${unassigned.length > 1 ? 'es' : ''} sem time:
                ${unassigned.map(p => p.name).join(', ')}
            </div>
        ` : ''}

        ${canStartTournamentAction() ? `
        <button class="btn btn-primary btn-block btn-lg" onclick="startTournament()"
                ${canStartTournament() ? '' : 'disabled'}>
            ⚽ Iniciar Torneio
        </button>` : ''}
        ${canResetTournament() ? `
        <div class="divider"></div>
        <button class="btn btn-danger btn-block btn-sm" onclick="confirmResetTournament()">
            Cancelar Torneio
        </button>` : ''}
    `;
}

// ═══════════════════════════════════════════════════
// MATCH SCHEDULING & PLAY
// ═══════════════════════════════════════════════════

// Flag: when true, confirmGoalkeepers also finalizes the match
let _pendingFinalizeMatch = false;

function getCurrentMatchIndex() {
    const t = state.currentTournament;
    if (!t || !t.matches.length) return -1;
    const idx = t.matches.findIndex(m => m.status === 'in_progress');
    if (idx >= 0) return idx;
    return t.matches.findIndex(m => m.status === 'pending');
}

function startNextMatch() {
    const t = state.currentTournament;
    const idx = t.matches.findIndex(m => m.status === 'pending');
    if (idx >= 0) {
        t.matches[idx].status = 'in_progress';
        saveState();
    }
}

function selectMatch1Teams(homeId, awayId) {
    const t = state.currentTournament;
    t.match1Selection = { home: homeId, away: awayId };
    t.matches = [{
        round: 1,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeScore: 0,
        awayScore: 0,
        homeGoalkeeper: null,
        awayGoalkeeper: null,
        goals: [],
        status: 'in_progress',
        timerDuration: 600, // 10 minutes in seconds
        timerRemaining: 600,
        timerRunning: false,
        timerStartedAt: null
    }];
    t.status = 'in_progress';
    saveState();
    renderMatches();
}

// ── Goal management ──

function addGoalToMatch(teamId) {
    if (!canScoreGoals()) { showToast('Sem permissão!'); return; }
    const t = state.currentTournament;
    const idx = getCurrentMatchIndex();
    if (idx < 0) return;
    const match = t.matches[idx];
    if (match.status !== 'in_progress') return;

    const team = getTeam(teamId);
    if (!team) return;

    // Get goalkeeper for this team in this match
    const goalkeeperIdForTeam = teamId === match.homeTeamId ? match.homeGoalkeeper : match.awayGoalkeeper;

    // Build player list with unique IDs to avoid duplicates
    const playerSet = new Set(team.players);
    if (goalkeeperIdForTeam && !playerSet.has(goalkeeperIdForTeam)) {
        playerSet.add(goalkeeperIdForTeam);
    }

    const playersList = Array.from(playerSet).map(pid => {
        const isGoalkeeper = pid === goalkeeperIdForTeam;
        const playerName = getPlayerName(pid);
        return `
        <li onclick="recordGoal('${teamId}', '${pid}')" style="${isGoalkeeper ? 'background:var(--bg-input);' : ''}">
            ${esc(playerName)} ${isGoalkeeper ? '🧤' : ''}
        </li>
    `}).join('');

    showModal(`
        <div class="modal-title">⚽ Quem marcou o gol?</div>
        <div style="text-align:center;margin-bottom:12px;">
            <span style="display:inline-flex;align-items:center;gap:6px;">
                <span class="score-team-color" style="background:${team.color}"></span>
                <strong>${esc(team.name)}</strong>
            </span>
        </div>
        <ul class="modal-player-list">${playersList}</ul>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
        </div>
    `);
}

function recordGoal(teamId, playerId) {
    const t = state.currentTournament;
    const idx = getCurrentMatchIndex();
    if (idx < 0) return;
    const match = t.matches[idx];

    match.goals.push({ teamId, playerId });
    if (teamId === match.homeTeamId) match.homeScore++;
    else match.awayScore++;

    saveState();
    hideModal();
    renderMatches();
    showToast(`⚽ GOL! ${getPlayerName(playerId)}`);
}

function removeGoal(matchIdx, goalIdx) {
    if (!canScoreGoals()) { showToast('Sem permissão!'); return; }
    const t = state.currentTournament;
    const match = t.matches[matchIdx];
    if (!match || match.status === 'finished') return;

    const goal = match.goals[goalIdx];
    if (goal.teamId === match.homeTeamId) {
        match.homeScore = Math.max(0, match.homeScore - 1);
    } else {
        match.awayScore = Math.max(0, match.awayScore - 1);
    }
    match.goals.splice(goalIdx, 1);
    saveState();
    renderMatches();
}

// ── Match Timer Management ──

function resumeMatchTimerIfNeeded() {
    const t = state.currentTournament;
    if (!t || !t.matches) return;
    
    // Find active match with running timer
    const activeMatch = t.matches.find(m => m.status === 'in_progress' && m.timerRunning);
    if (!activeMatch) return;
    
    const matchIdx = t.matches.indexOf(activeMatch);
    
    // Calculate elapsed time since timer was paused (if any)
    if (activeMatch.timerStartedAt) {
        const elapsed = Math.floor((Date.now() - activeMatch.timerStartedAt) / 1000);
        activeMatch.timerRemaining = Math.max(0, activeMatch.timerRemaining - elapsed);
    }
    
    // Resume timer
    startMatchTimer(matchIdx);
}

function startMatchTimer(matchIdx) {
    const t = state.currentTournament;
    const match = t.matches[matchIdx];
    if (!match || match.status !== 'in_progress') return;

    match.timerRunning = true;
    match.timerStartedAt = Date.now();
    saveState();

    // Clear any existing interval
    if (matchTimerInterval) clearInterval(matchTimerInterval);

    // Start interval
    matchTimerInterval = setInterval(() => {
        updateMatchTimer(matchIdx);
    }, 1000);

    renderMatches();
}

function pauseMatchTimer(matchIdx) {
    const t = state.currentTournament;
    const match = t.matches[matchIdx];
    if (!match || match.status !== 'in_progress') return;

    match.timerRunning = false;
    
    if (matchTimerInterval) {
        clearInterval(matchTimerInterval);
        matchTimerInterval = null;
    }

    saveState();
    renderMatches();
}

function updateMatchTimer(matchIdx) {
    const t = state.currentTournament;
    const match = t.matches[matchIdx];
    if (!match || match.status !== 'in_progress' || !match.timerRunning) return;

    if (match.timerRemaining > 0) {
        match.timerRemaining--;
        saveState();

        // Update UI without full re-render
        const timerDisplay = document.getElementById('match-timer-display');
        if (timerDisplay) {
            const minutes = Math.floor(match.timerRemaining / 60);
            const seconds = match.timerRemaining % 60;
            timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            // Warning colors
            if (match.timerRemaining <= 60) {
                timerDisplay.style.color = 'var(--danger)';
            } else if (match.timerRemaining <= 180) {
                timerDisplay.style.color = 'var(--warning)';
            }
        }

        if (match.timerRemaining === 0) {
            // Timer finished - play whistle sound
            playWhistleSound();
            pauseMatchTimer(matchIdx);
            showToast('⏱️ Tempo esgotado!');
        }
    }
}

function resetMatchTimer(matchIdx) {
    const t = state.currentTournament;
    const match = t.matches[matchIdx];
    if (!match) return;

    match.timerRemaining = match.timerDuration || 600;
    match.timerRunning = false;
    
    if (matchTimerInterval) {
        clearInterval(matchTimerInterval);
        matchTimerInterval = null;
    }

    saveState();
    renderMatches();
}

function playWhistleSound() {
    // Create audio context and generate realistic referee whistle sound
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const now = audioContext.currentTime;
        const duration = 2.2; // 2.2 seconds total
        
        // Main whistle tone (1900 Hz)
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        osc1.frequency.value = 1900;
        osc1.type = 'sine';
        
        // Volume envelope: fade in/out with sustain
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.6, now + 0.1);
        gain1.gain.linearRampToValueAtTime(0.5, now + 1.0);
        gain1.gain.linearRampToValueAtTime(0.7, now + 1.5);
        gain1.gain.linearRampToValueAtTime(0, now + duration);
        
        osc1.start(now);
        osc1.stop(now + duration);
        
        // Second harmonic (2800 Hz) for richer tone
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 2800;
        osc2.type = 'triangle';
        
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.linearRampToValueAtTime(0.3, now + 0.1);
        gain2.gain.linearRampToValueAtTime(0.25, now + 1.0);
        gain2.gain.linearRampToValueAtTime(0.35, now + 1.5);
        gain2.gain.linearRampToValueAtTime(0, now + duration);
        
        osc2.start(now);
        osc2.stop(now + duration);
        
        // Frequency modulation for realistic whistle variation
        const lfo = audioContext.createOscillator();
        const lfoGain = audioContext.createGain();
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfo.frequency.value = 4; // LFO at 4 Hz for natural variation
        lfoGain.gain.value = 50; // Frequency swing of ±50 Hz
        
        lfo.start(now);
        lfo.stop(now + duration);
    } catch (e) {
        console.error('Erro ao tocar som:', e);
    }
}

// ── Goalkeeper management ──

function showGoalkeeperModal(matchIdx) {
    const t = state.currentTournament;
    const match = t.matches[matchIdx];
    const homeTeam = getTeam(match.homeTeamId);
    const awayTeam = getTeam(match.awayTeamId);

    // Sort players: first goalkeepers (isGoalkeeper: true), then others
    const allPlayers = [...state.players].sort((a, b) => {
        if (a.isGoalkeeper !== b.isGoalkeeper) return b.isGoalkeeper ? 1 : -1;
        return a.name.localeCompare(b.name);
    });

    // Helper function to build options for a team
    const buildGoalkeeperOptions = (team, currentGoalkeeperValue) => {
        const teamGoalkeepers = allPlayers.filter(p => team.players.includes(p.id) && p.isGoalkeeper);
        const otherTeamPlayers = allPlayers.filter(p => team.players.includes(p.id) && !p.isGoalkeeper);
        
        let html = '';
        
        // Team goalkeepers (marked as such and in the team)
        if (teamGoalkeepers.length > 0) {
            html += `<optgroup label="🧤 Goleiros do Time">`;
            teamGoalkeepers.forEach(p => {
                html += `<option value="${p.id}" ${currentGoalkeeperValue === p.id ? 'selected' : ''}>${esc(p.name)} 🧤</option>`;
            });
            html += `</optgroup>`;
        }
        
        // Other team players (as fallback)
        if (otherTeamPlayers.length > 0) {
            html += `<optgroup label="Outros Jogadores do Time">`;
            otherTeamPlayers.forEach(p => {
                html += `<option value="${p.id}" ${currentGoalkeeperValue === p.id ? 'selected' : ''}>${esc(p.name)}</option>`;
            });
            html += `</optgroup>`;
        }
        
        // All other players (from other teams or not assigned)
        const otherPlayers = allPlayers.filter(p => !team.players.includes(p.id));
        if (otherPlayers.length > 0) {
            html += `<optgroup label="Outros Jogadores">`;
            otherPlayers.forEach(p => {
                html += `<option value="${p.id}" ${currentGoalkeeperValue === p.id ? 'selected' : ''}>${esc(p.name)}${p.isGoalkeeper ? ' 🧤' : ''}</option>`;
            });
            html += `</optgroup>`;
        }
        
        return html;
    };

    // Pre-select with designated goalkeeper or current value
    const homeGoalkeeperValue = match.homeGoalkeeper !== null ? match.homeGoalkeeper : homeTeam.designatedGoalkeeperId;
    const awayGoalkeeperValue = match.awayGoalkeeper !== null ? match.awayGoalkeeper : awayTeam.designatedGoalkeeperId;

    const homeOptions = buildGoalkeeperOptions(homeTeam, homeGoalkeeperValue);
    const awayOptions = buildGoalkeeperOptions(awayTeam, awayGoalkeeperValue);

    showModal(`
        <div class="modal-title">🧤 Goleiros da Partida</div>
        <p style="text-align:center;color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px;">
            Informe o goleiro de cada time para esta partida
        </p>
        <div class="modal-gk-section">
            <div class="gk-team-label">
                <span class="score-team-color" style="background:${homeTeam.color}"></span>
                ${esc(homeTeam.name)}
            </div>
            <select id="gk-home-select">
                <option value="">Selecione o goleiro...</option>
                ${homeOptions}
            </select>
        </div>
        <div class="modal-gk-section">
            <div class="gk-team-label">
                <span class="score-team-color" style="background:${awayTeam.color}"></span>
                ${esc(awayTeam.name)}
            </div>
            <select id="gk-away-select">
                <option value="">Selecione o goleiro...</option>
                ${awayOptions}
            </select>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="hideModal();_pendingFinalizeMatch=false;">Cancelar</button>
            <button class="btn btn-primary" onclick="confirmGoalkeepers(${matchIdx})">Confirmar</button>
        </div>
    `);
}

function confirmGoalkeepers(matchIdx) {
    const homeSelect = document.getElementById('gk-home-select');
    const awaySelect = document.getElementById('gk-away-select');

    if (!homeSelect.value || !awaySelect.value) {
        showToast('Selecione o goleiro de ambos os times!');
        return;
    }

    const t = state.currentTournament;
    const match = t.matches[matchIdx];
    match.homeGoalkeeper = homeSelect.value;
    match.awayGoalkeeper = awaySelect.value;
    saveState();
    hideModal();

    if (_pendingFinalizeMatch) {
        _pendingFinalizeMatch = false;
        finalizeMatch(matchIdx);
    } else {
        showToast('🧤 Goleiros definidos!');
        renderMatches();
    }
}

// ── Match end flow ──

function confirmEndMatch(matchIdx) {
    const t = state.currentTournament;
    const match = t.matches[matchIdx];
    if (!match || match.status !== 'in_progress') return;

    const homeTeam = getTeam(match.homeTeamId);
    const awayTeam = getTeam(match.awayTeamId);

    showModal(`
        <div class="modal-title">⚠️ Encerrar Partida?</div>
        <p style="text-align:center;color:var(--text-secondary);margin-bottom:16px;">
            Confirme o encerramento da partida:
        </p>
        <div style="text-align:center;margin-bottom:16px;">
            <div style="font-size:1.2rem;font-weight:700;margin-bottom:8px;">
                <span style="color:${homeTeam.color}">${esc(homeTeam.name)}</span>
                <span style="margin:0 8px;">${match.homeScore} × ${match.awayScore}</span>
                <span style="color:${awayTeam.color}">${esc(awayTeam.name)}</span>
            </div>
            <small style="color:var(--text-muted);">Jogo ${match.round} de ${TOTAL_ROUNDS}</small>
        </div>
        <p style="text-align:center;color:var(--text-secondary);font-size:0.85rem;">
            Após encerrar, não será possível editar o placar.
        </p>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="hideModal();endMatch(${matchIdx})">Confirmar e Encerrar</button>
        </div>
    `);
}

function endMatch(matchIdx) {
    const t = state.currentTournament;
    const match = t.matches[matchIdx];
    if (!match || match.status !== 'in_progress') return;

    if (!match.homeGoalkeeper || !match.awayGoalkeeper) {
        _pendingFinalizeMatch = true;
        showGoalkeeperModal(matchIdx);
        return;
    }

    finalizeMatch(matchIdx);
}

function finalizeMatch(matchIdx) {
    const t = state.currentTournament;
    const match = t.matches[matchIdx];
    match.status = 'finished';
    saveState();

    // After match 1: determine who stays (only if schedule not yet generated)
    if (matchIdx === 0 && !t.scheduleGenerated) {
        if (match.homeScore > match.awayScore) {
            handleMatch1Result(match.homeTeamId, match.awayTeamId);
            return;
        } else if (match.awayScore > match.homeScore) {
            handleMatch1Result(match.awayTeamId, match.homeTeamId);
            return;
        } else {
            showStayChoiceModal(match);
            return;
        }
    }

    // Check if tournament is finished
    if (t.matches.every(m => m.status === 'finished')) {
        t.status = 'finished';
        // Save finished tournament to history with champion info
        saveTournamentToHistory(t);
        saveState();
        renderMatches();
        setTimeout(() => showChampionScreen(), 800);
        return;
    }

    startNextMatch();
    saveState();
    renderMatches();
}

/**
 * Saves a finished tournament snapshot to history,
 * including champion info and player name snapshots.
 */
function saveTournamentToHistory(tournament) {
    const standings = calculateStandingsForTournament(tournament);
    const champion = standings.length > 0 ? standings[0] : null;

    // Snapshot player names at this point in time
    const playerSnapshot = {};
    state.players.forEach(p => { playerSnapshot[p.id] = p.name; });
    // Also include any player referenced in the tournament but maybe already deleted
    tournament.teams.forEach(team => {
        team.players.forEach(pid => {
            if (!playerSnapshot[pid]) playerSnapshot[pid] = getPlayerName(pid);
        });
    });

    const historyEntry = {
        ...JSON.parse(JSON.stringify(tournament)),
        finishedAt: new Date().toISOString(),
        champion: champion ? {
            teamId: champion.teamId,
            teamName: champion.name,
            teamColor: champion.color,
            pts: champion.pts,
            won: champion.won,
            drawn: champion.drawn,
            lost: champion.lost,
            gf: champion.gf,
            ga: champion.ga,
            gd: champion.gd,
            playerIds: tournament.teams.find(t => t.id === champion.teamId)?.players || []
        } : null,
        playerSnapshot
    };

    // Remove duplicates (in case saved twice)
    state.history = state.history.filter(h => h.id !== tournament.id);
    state.history.push(historyEntry);

    // Also save to Firestore history collection
    db.collection('history').add(historyEntry)
        .catch(e => console.error('Erro ao salvar histórico no Firestore:', e));
}

// ── Schedule generation after match 1 result ──

function handleMatch1Result(stayTeamId, leaveTeamId) {
    const t = state.currentTournament;

    // Save match 1 data before regenerating schedule
    const match1Data = { ...t.matches[0], goals: [...t.matches[0].goals] };

    const allIds = t.teams.map(x => x.id);
    const restingId = allIds.find(id => id !== match1Data.homeTeamId && id !== match1Data.awayTeamId);

    t.stayTeam = stayTeamId;
    t.leavingTeam = leaveTeamId;
    t.restingTeam = restingId;

    // Resting cycle: [C (rested match1), L (left match1), S (stayed match1&2)]
    const restCycle = [restingId, leaveTeamId, stayTeamId];

    // Generate all 9 matches
    t.matches = [];
    for (let round = 0; round < TOTAL_ROUNDS; round++) {
        const resting = restCycle[round % 3];
        const playing = allIds.filter(id => id !== resting);
        t.matches.push({
            round: round + 1,
            homeTeamId: playing[0],
            awayTeamId: playing[1],
            homeScore: 0,
            awayScore: 0,
            homeGoalkeeper: null,
            awayGoalkeeper: null,
            goals: [],
            status: 'pending',
            timerDuration: 600,
            timerRemaining: 600,
            timerRunning: false,
            timerStartedAt: null
        });
    }

    // Restore match 1 actual data
    t.matches[0] = {
        ...t.matches[0],
        ...match1Data,
        status: 'finished',
        homeTeamId: match1Data.homeTeamId,
        awayTeamId: match1Data.awayTeamId,
    };

    // Start match 2
    t.matches[1].status = 'in_progress';
    t.scheduleGenerated = true;
    saveState();
    renderMatches();
}

function showStayChoiceModal(match) {
    const homeTeam = getTeam(match.homeTeamId);
    const awayTeam = getTeam(match.awayTeamId);

    showModal(`
        <div class="modal-title">🤝 Empate!</div>
        <p style="text-align:center;color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px;">
            Qual time fica na quadra para o próximo jogo?
        </p>
        <ul class="modal-player-list">
            <li onclick="chooseStayTeam('${match.homeTeamId}', '${match.awayTeamId}')">
                <span class="score-team-color" style="background:${homeTeam.color};display:inline-block;margin-right:6px;"></span>
                ${esc(homeTeam.name)}
            </li>
            <li onclick="chooseStayTeam('${match.awayTeamId}', '${match.homeTeamId}')">
                <span class="score-team-color" style="background:${awayTeam.color};display:inline-block;margin-right:6px;"></span>
                ${esc(awayTeam.name)}
            </li>
        </ul>
    `);
}

function chooseStayTeam(stayId, leaveId) {
    hideModal();
    handleMatch1Result(stayId, leaveId);
}

// ═══════════════════════════════════════════════════
// RENDER MATCHES
// ═══════════════════════════════════════════════════
function renderMatches() {
    const container = document.getElementById('matches-content');
    const t = state.currentTournament;

    if (!t) {
        container.innerHTML = `
            <div class="view-header"><h2>⚽ Partidas</h2></div>
            <div class="empty-state">
                <div class="empty-state-icon">⚽</div>
                <div class="empty-state-text">Nenhum torneio ativo.<br>Crie um torneio primeiro!</div>
            </div>
        `;
        return;
    }

    if (t.status === 'setup') {
        container.innerHTML = `
            <div class="view-header"><h2>⚽ Partidas</h2></div>
            <div class="notice notice-info">
                Configure os times na aba <strong>Torneio</strong> primeiro.
            </div>
        `;
        return;
    }

    // Scheduling phase: select teams for match 1
    if (t.status === 'scheduling' || (t.status === 'in_progress' && t.matches.length === 0)) {
        if (canStartTournamentAction()) {
            renderMatch1Selection(container);
        } else {
            container.innerHTML = `
                <div class="view-header"><h2>⚽ Partidas</h2></div>
                <div class="notice notice-info">
                    Aguardando o capitão ou admin definir o primeiro jogo.
                </div>`;
        }
        return;
    }

    // Active tournament with matches
    const currentIdx = getCurrentMatchIndex();
    const currentMatch = currentIdx >= 0 ? t.matches[currentIdx] : null;

    let html = `<div class="view-header"><h2>⚽ Partidas</h2></div>`;

    // Current match scoreboard
    if (currentMatch && currentMatch.status === 'in_progress') {
        html += renderActiveMatch(currentMatch, currentIdx);
    } else if (t.status === 'finished') {
        html += `
            <div class="notice notice-success">
                🏆 Torneio finalizado! Veja a classificação na aba <strong>Tabela</strong>.
            </div>
            <button class="btn btn-gold btn-block" onclick="showChampionScreen()">
                🏆 Ver Campeão
            </button>
            <div class="divider"></div>
        `;
    }

    // Match schedule / history
    html += renderMatchList();

    container.innerHTML = html;
}

function renderMatch1Selection(container) {
    const t = state.currentTournament;
    let selectedTeams = [];

    container.innerHTML = `
        <div class="view-header">
            <h2>⚽ Jogo 1 — Escolha os Times</h2>
            <p class="view-subtitle">Selecione os 2 times que jogam primeiro (os que chegaram antes na quadra)</p>
        </div>
        <div class="match-select">
            <div class="team-select-grid" id="team-select-grid">
                ${t.teams.map(team => `
                    <button class="team-select-btn" data-team-id="${team.id}" onclick="toggleMatch1Team('${team.id}')">
                        ${team.imgRight ? `<img src="${team.imgRight}" alt="${esc(team.name)}" class="team-select-img">` : `<span class="team-color-indicator" style="background:${team.color}"></span>`}
                        ${esc(team.name)}
                    </button>
                `).join('')}
            </div>
            <button class="btn btn-primary btn-block btn-lg" id="btn-confirm-match1" onclick="confirmMatch1()" disabled>
                Confirmar e Iniciar Jogo 1
            </button>
        </div>
    `;
}

// Track match 1 selection
let match1SelectedTeams = [];

function toggleMatch1Team(teamId) {
    const idx = match1SelectedTeams.indexOf(teamId);
    if (idx >= 0) {
        match1SelectedTeams.splice(idx, 1);
    } else {
        if (match1SelectedTeams.length >= 2) {
            match1SelectedTeams.shift();
        }
        match1SelectedTeams.push(teamId);
    }

    // Update UI
    document.querySelectorAll('.team-select-btn').forEach(btn => {
        btn.classList.toggle('selected', match1SelectedTeams.includes(btn.dataset.teamId));
    });

    const confirmBtn = document.getElementById('btn-confirm-match1');
    if (confirmBtn) {
        confirmBtn.disabled = match1SelectedTeams.length !== 2;
    }
}

function confirmMatch1() {
    if (match1SelectedTeams.length !== 2) return;
    selectMatch1Teams(match1SelectedTeams[0], match1SelectedTeams[1]);
    match1SelectedTeams = [];
}

function renderActiveMatch(match, idx) {
    const homeTeam = getTeam(match.homeTeamId);
    const awayTeam = getTeam(match.awayTeamId);
    const t = state.currentTournament;

    // Find resting team
    const playingIds = [match.homeTeamId, match.awayTeamId];
    const restingTeam = t.teams.find(team => !playingIds.includes(team.id));

    let html = `
        <div class="scoreboard">
            <div class="match-label">Jogo ${match.round} de ${TOTAL_ROUNDS}</div>
            <span class="match-status-badge badge-live">🔴 AO VIVO</span>

            <div class="score-display">
                <div class="score-team">
                    ${homeTeam.imgLeft ? `<img src="${homeTeam.imgLeft}" alt="${esc(homeTeam.name)}" class="score-team-img">` : ''}
                    <div class="score-team-name">
                        <span class="score-team-color" style="background:${homeTeam.color}"></span>
                        ${esc(homeTeam.name)}
                    </div>
                    <div class="score-number">${match.homeScore}</div>
                    ${canScoreGoals() ? `
                    <button class="btn-goal" style="background:${homeTeam.color};color:${getContrastColor(homeTeam.color)}"
                            onclick="addGoalToMatch('${match.homeTeamId}')">
                        ⚽ GOL
                    </button>` : ''}
                </div>

                <div class="score-vs">×</div>

                <div class="score-team">
                    ${awayTeam.imgRight ? `<img src="${awayTeam.imgRight}" alt="${esc(awayTeam.name)}" class="score-team-img">` : ''}
                    <div class="score-team-name">
                        <span class="score-team-color" style="background:${awayTeam.color}"></span>
                        ${esc(awayTeam.name)}
                    </div>
                    <div class="score-number">${match.awayScore}</div>
                    ${canScoreGoals() ? `
                    <button class="btn-goal" style="background:${awayTeam.color};color:${getContrastColor(awayTeam.color)}"
                            onclick="addGoalToMatch('${match.awayTeamId}')">
                        ⚽ GOL
                    </button>` : ''}
                </div>
            </div>

            ${restingTeam ? `<div class="score-resting">🪑 Descansando: ${esc(restingTeam.name)}</div>` : ''}
    `;

    // Goals list
    if (match.goals.length > 0) {
        let runningHome = 0, runningAway = 0;
        html += `<div class="goals-list"><div class="goals-list-title">Gols</div>`;
        match.goals.forEach((goal, gIdx) => {
            if (goal.teamId === match.homeTeamId) runningHome++;
            else runningAway++;
            const scoreStr = `${runningHome}-${runningAway}`;
            const team = getTeam(goal.teamId);
            html += `
                <div class="goal-item">
                    <span class="goal-icon">⚽</span>
                    <span class="goal-score">${scoreStr}</span>
                    <span class="goal-player">${esc(getPlayerName(goal.playerId))}</span>
                    <span class="goal-team" style="color:${team.color}">${esc(team.name)}</span>
                    ${canScoreGoals() ? `<button class="btn-remove-goal" onclick="removeGoal(${idx}, ${gIdx})" title="Remover gol">✕</button>` : ''}
                </div>`;
        });
        html += `</div>`;
    }

    // Goalkeeper info
    html += `<div style="margin-top:12px;display:flex;gap:10px;justify-content:center;font-size:0.8rem;">`;
    if (match.homeGoalkeeper) {
        html += `<span style="color:var(--text-secondary)">🧤 ${esc(homeTeam.name)}: <strong>${esc(getPlayerName(match.homeGoalkeeper))}</strong></span>`;
    }
    if (match.awayGoalkeeper) {
        html += `<span style="color:var(--text-secondary)">🧤 ${esc(awayTeam.name)}: <strong>${esc(getPlayerName(match.awayGoalkeeper))}</strong></span>`;
    }
    html += `</div>`;

    // Match Timer
    const minutes = Math.floor(match.timerRemaining / 60);
    const seconds = match.timerRemaining % 60;
    const timerDisplay = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    const timerClass = match.timerRemaining <= 60 ? 'timer-danger' : match.timerRemaining <= 180 ? 'timer-warning' : '';
    
    html += `
        <div style="margin-top:16px;text-align:center;">
            <div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:4px;">⏱️ Tempo de Partida</div>
            <div id="match-timer-display" style="font-size:2.5rem;font-weight:bold;margin:8px 0;" class="${timerClass}">
                ${timerDisplay}
            </div>
            <div style="display:flex;gap:8px;justify-content:center;margin-top:8px;">
                ${!match.timerRunning ? `
                    <button class="btn btn-success btn-sm" onclick="startMatchTimer(${idx})">
                        ▶️ ${match.timerRemaining === match.timerDuration ? 'Iniciar' : 'Retomar'}
                    </button>
                ` : `
                    <button class="btn btn-warning btn-sm" onclick="pauseMatchTimer(${idx})">
                        ⏸️ Pausar
                    </button>
                `}
                ${match.timerRemaining !== match.timerDuration ? `
                    <button class="btn btn-secondary btn-sm" onclick="resetMatchTimer(${idx})">
                        🔄 Resetar
                    </button>
                ` : ''}
            </div>
        </div>
    `;

    // End match button
    html += `
            <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;">
                ${canSetGoalkeepers() ? `<button class="btn btn-secondary btn-sm" onclick="showGoalkeeperModal(${idx})">
                    🧤 Definir Goleiros
                </button>` : ''}
                ${canEndMatch() ? `<button class="btn btn-primary" onclick="confirmEndMatch(${idx})">
                    Encerrar Partida
                </button>` : ''}
            </div>
        </div>
    `;

    return html;
}

function renderMatchList() {
    const t = state.currentTournament;
    if (!t || !t.matches.length) return '';

    let html = `<div class="match-history"><div class="match-history-title">📋 Tabela de Jogos</div>`;

    t.matches.forEach((match, idx) => {
        const homeTeam = getTeam(match.homeTeamId);
        const awayTeam = getTeam(match.awayTeamId);
        const isCurrent = match.status === 'in_progress';
        const isFinished = match.status === 'finished';

        let winnerSide = null;
        if (isFinished) {
            if (match.homeScore > match.awayScore) winnerSide = 'home';
            else if (match.awayScore > match.homeScore) winnerSide = 'away';
        }

        html += `
            <div class="match-history-item ${isCurrent ? 'current' : ''}">
                <span class="mh-round">${match.round}</span>
                <div class="mh-teams">
                    <span class="mh-team-name mh-home ${winnerSide === 'home' ? 'mh-winner' : ''}"
                          style="${winnerSide === 'home' ? 'color:var(--accent)' : ''}">
                        ${homeTeam.imgLeft ? `<img src="${homeTeam.imgLeft}" alt="" class="mh-team-img">` : `<span class="score-team-color" style="background:${homeTeam.color};display:inline-block;vertical-align:middle;margin-right:4px;"></span>`}
                        ${esc(homeTeam.name)}
                    </span>
                    <span class="mh-score">
                        ${isFinished ? `${match.homeScore} × ${match.awayScore}` : (isCurrent ? `${match.homeScore} × ${match.awayScore}` : '– × –')}
                    </span>
                    <span class="mh-team-name mh-away ${winnerSide === 'away' ? 'mh-winner' : ''}"
                          style="${winnerSide === 'away' ? 'color:var(--accent)' : ''}">
                        ${esc(awayTeam.name)}
                        ${awayTeam.imgRight ? `<img src="${awayTeam.imgRight}" alt="" class="mh-team-img">` : `<span class="score-team-color" style="background:${awayTeam.color};display:inline-block;vertical-align:middle;margin-left:4px;"></span>`}
                    </span>
                </div>
            </div>`;
    });

    html += `</div>`;
    return html;
}

// ═══════════════════════════════════════════════════
// STANDINGS
// ═══════════════════════════════════════════════════
function calculateStandings() {
    const t = state.currentTournament;
    if (!t) return [];
    return calculateStandingsForTournament(t);
}

/**
 * Generic standings calculator — works on any tournament object.
 */
function calculateStandingsForTournament(t) {
    if (!t) return [];

    const standings = {};
    t.teams.forEach(team => {
        standings[team.id] = {
            teamId: team.id,
            name: team.name,
            color: team.color,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            gf: 0,
            ga: 0,
            gd: 0,
            pts: 0
        };
    });

    t.matches.filter(m => m.status === 'finished').forEach(match => {
        const home = standings[match.homeTeamId];
        const away = standings[match.awayTeamId];

        home.played++;
        away.played++;
        home.gf += match.homeScore;
        home.ga += match.awayScore;
        away.gf += match.awayScore;
        away.ga += match.homeScore;

        if (match.homeScore > match.awayScore) {
            home.won++; home.pts += WIN_PTS;
            away.lost++;
        } else if (match.awayScore > match.homeScore) {
            away.won++; away.pts += WIN_PTS;
            home.lost++;
        } else {
            home.drawn++; home.pts += DRAW_PTS;
            away.drawn++; away.pts += DRAW_PTS;
        }

        home.gd = home.gf - home.ga;
        away.gd = away.gf - away.ga;
    });

    // Sort with tiebreakers
    let arr = Object.values(standings);
    arr.sort((a, b) => {
        // 1. Points
        if (b.pts !== a.pts) return b.pts - a.pts;

        // 2. Head-to-head
        const h2h = getHeadToHeadForTournament(t, a.teamId, b.teamId);
        if (h2h.aPts !== h2h.bPts) return h2h.bPts - h2h.aPts;

        // 3. Goal difference
        if (b.gd !== a.gd) return b.gd - a.gd;

        // 4. Goals scored
        return b.gf - a.gf;
    });

    return arr;
}

function getHeadToHead(teamAId, teamBId) {
    return getHeadToHeadForTournament(state.currentTournament, teamAId, teamBId);
}

function getHeadToHeadForTournament(t, teamAId, teamBId) {
    let aPts = 0, bPts = 0, aGf = 0, aGa = 0;

    t.matches.filter(m => m.status === 'finished').forEach(match => {
        const isH2H = (match.homeTeamId === teamAId && match.awayTeamId === teamBId) ||
                       (match.homeTeamId === teamBId && match.awayTeamId === teamAId);
        if (!isH2H) return;

        let aScore, bScore;
        if (match.homeTeamId === teamAId) {
            aScore = match.homeScore;
            bScore = match.awayScore;
        } else {
            aScore = match.awayScore;
            bScore = match.homeScore;
        }

        aGf += aScore;
        aGa += bScore;

        if (aScore > bScore) aPts += WIN_PTS;
        else if (bScore > aScore) bPts += WIN_PTS;
        else { aPts += DRAW_PTS; bPts += DRAW_PTS; }
    });

    return { aPts, bPts, aGf, aGa };
}

function renderStandings() {
    const container = document.getElementById('standings-content');
    const t = state.currentTournament;

    if (!t || t.matches.filter(m => m.status === 'finished').length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <div class="empty-state-text">Nenhum jogo finalizado ainda.</div>
            </div>`;
        return;
    }

    const standings = calculateStandings();

    let html = `
        <div class="standings-table-wrapper">
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Time</th>
                        <th>J</th>
                        <th>V</th>
                        <th>E</th>
                        <th>D</th>
                        <th>GF</th>
                        <th>GC</th>
                        <th>SG</th>
                        <th>PTS</th>
                    </tr>
                </thead>
                <tbody>
    `;

    standings.forEach((s, i) => {
        html += `
            <tr>
                <td><span class="pos-badge pos-${i + 1}">${i + 1}</span></td>
                <td>
                    <span style="display:inline-flex;align-items:center;gap:6px;">
                        <span class="score-team-color" style="background:${s.color}"></span>
                        ${esc(s.name)}
                    </span>
                </td>
                <td>${s.played}</td>
                <td>${s.won}</td>
                <td>${s.drawn}</td>
                <td>${s.lost}</td>
                <td>${s.gf}</td>
                <td>${s.ga}</td>
                <td>${s.gd > 0 ? '+' : ''}${s.gd}</td>
                <td class="pts">${s.pts}</td>
            </tr>`;
    });

    html += `</tbody></table></div>`;

    // Head-to-head mini table
    html += renderH2HTable();

    container.innerHTML = html;
}

function renderH2HTable() {
    const t = state.currentTournament;
    if (!t) return '';

    const finishedMatches = t.matches.filter(m => m.status === 'finished');
    if (finishedMatches.length === 0) return '';

    let html = `
        <div class="h2h-section">
            <h3 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;">⚔️ Confrontos Diretos</h3>
    `;

    // Get unique pairings
    const pairs = [];
    for (let i = 0; i < t.teams.length; i++) {
        for (let j = i + 1; j < t.teams.length; j++) {
            pairs.push([t.teams[i], t.teams[j]]);
        }
    }

    pairs.forEach(([teamA, teamB]) => {
        const matches = finishedMatches.filter(m =>
            (m.homeTeamId === teamA.id && m.awayTeamId === teamB.id) ||
            (m.homeTeamId === teamB.id && m.awayTeamId === teamA.id)
        );

        if (matches.length === 0) return;

        html += `
            <div style="margin-bottom:12px;">
                <div style="font-size:0.8rem;font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:4px;">
                    <span class="score-team-color" style="background:${teamA.color}"></span>${esc(teamA.name)}
                    <span style="color:var(--text-muted)">×</span>
                    <span class="score-team-color" style="background:${teamB.color}"></span>${esc(teamB.name)}
                </div>
                ${matches.map(m => {
                    const aIsHome = m.homeTeamId === teamA.id;
                    const aScore = aIsHome ? m.homeScore : m.awayScore;
                    const bScore = aIsHome ? m.awayScore : m.homeScore;
                    return `<div style="font-size:0.8rem;color:var(--text-secondary);padding:2px 8px;">
                        Jogo ${m.round}: ${aScore} × ${bScore}
                    </div>`;
                }).join('')}
            </div>`;
    });

    html += `</div>`;
    return html;
}

// ═══════════════════════════════════════════════════
// STATISTICS — TOURNAMENT-LEVEL
// ═══════════════════════════════════════════════════
function getTopScorersForTournament(t) {
    if (!t) return [];
    const scorers = {};
    t.matches.filter(m => m.status === 'finished').forEach(match => {
        match.goals.forEach(goal => {
            if (!scorers[goal.playerId]) {
                scorers[goal.playerId] = {
                    playerId: goal.playerId,
                    name: getPlayerName(goal.playerId),
                    goals: 0,
                    teams: new Set()
                };
            }
            scorers[goal.playerId].goals++;
            scorers[goal.playerId].teams.add(goal.teamId);
        });
    });
    return Object.values(scorers)
        .sort((a, b) => b.goals - a.goals)
        .map(s => ({ ...s, teams: [...s.teams] }));
}

function getGoalkeeperStatsForTournament(t) {
    if (!t) return [];
    const gkStats = {};
    t.matches.filter(m => m.status === 'finished').forEach(match => {
        [{ gkId: match.homeGoalkeeper, ga: match.awayScore, gf: match.homeScore },
         { gkId: match.awayGoalkeeper, ga: match.homeScore, gf: match.awayScore }].forEach(({ gkId, ga, gf }) => {
            if (!gkId) return;
            if (!gkStats[gkId]) {
                gkStats[gkId] = {
                    playerId: gkId,
                    name: getPlayerName(gkId),
                    matches: 0, goalsAgainst: 0, wins: 0, draws: 0, losses: 0, cleanSheets: 0
                };
            }
            const gk = gkStats[gkId];
            gk.matches++;
            gk.goalsAgainst += ga;
            if (ga === 0) gk.cleanSheets++;
            if (gf > ga) gk.wins++;
            else if (gf < ga) gk.losses++;
            else gk.draws++;
        });
    });
    return Object.values(gkStats).sort((a, b) => {
        const avgA = a.matches ? a.goalsAgainst / a.matches : 999;
        const avgB = b.matches ? b.goalsAgainst / b.matches : 999;
        if (avgA !== avgB) return avgA - avgB;
        return b.cleanSheets - a.cleanSheets;
    });
}

function getTopScorers() { return getTopScorersForTournament(state.currentTournament); }
function getGoalkeeperStats() { return getGoalkeeperStatsForTournament(state.currentTournament); }

// ═══════════════════════════════════════════════════
// STATISTICS — ALL-TIME AGGREGATION
// ═══════════════════════════════════════════════════

/** Resolve player name from history snapshot or current players list */
function resolvePlayerName(playerId, tournament) {
    if (tournament?.playerSnapshot?.[playerId]) return tournament.playerSnapshot[playerId];
    return getPlayerName(playerId);
}

/** Get all finished tournaments from history */
function getFinishedHistory() {
    return state.history.filter(h => h.status === 'finished' && h.champion);
}

function getAllTimeChampions() {
    const finished = getFinishedHistory();
    const champions = {}; // playerId → { name, titles, tournaments[] }

    finished.forEach(t => {
        if (!t.champion) return;
        (t.champion.playerIds || []).forEach(pid => {
            const name = resolvePlayerName(pid, t);
            if (!champions[pid]) champions[pid] = { playerId: pid, name, titles: 0, teams: [] };
            champions[pid].titles++;
            champions[pid].teams.push(t.champion.teamName);
        });
    });

    return Object.values(champions).sort((a, b) => b.titles - a.titles);
}

function getAllTimeTopScorers() {
    const finished = getFinishedHistory();
    const scorers = {};

    finished.forEach(t => {
        t.matches.filter(m => m.status === 'finished').forEach(match => {
            match.goals.forEach(goal => {
                const name = resolvePlayerName(goal.playerId, t);
                if (!scorers[goal.playerId]) {
                    scorers[goal.playerId] = { playerId: goal.playerId, name, goals: 0, tournaments: 0 };
                }
                scorers[goal.playerId].goals++;
            });
        });
        // Count tournaments with at least 1 goal
        const tScorers = new Set();
        t.matches.filter(m => m.status === 'finished').forEach(m => m.goals.forEach(g => tScorers.add(g.playerId)));
        tScorers.forEach(pid => { if (scorers[pid]) scorers[pid].tournaments++; });
    });

    // Also include current tournament if it has finished matches
    const cur = state.currentTournament;
    if (cur && cur.matches.some(m => m.status === 'finished')) {
        const curScorers = new Set();
        cur.matches.filter(m => m.status === 'finished').forEach(match => {
            match.goals.forEach(goal => {
                const name = getPlayerName(goal.playerId);
                if (!scorers[goal.playerId]) {
                    scorers[goal.playerId] = { playerId: goal.playerId, name, goals: 0, tournaments: 0 };
                }
                scorers[goal.playerId].goals++;
                curScorers.add(goal.playerId);
            });
        });
        curScorers.forEach(pid => { if (scorers[pid]) scorers[pid].tournaments++; });
    }

    return Object.values(scorers).sort((a, b) => b.goals - a.goals);
}

function getAllTimeGoalkeeperStats() {
    const finished = getFinishedHistory();
    const gkStats = {};

    function addGkData(gkId, ga, gf, t) {
        if (!gkId) return;
        const name = resolvePlayerName(gkId, t);
        if (!gkStats[gkId]) {
            gkStats[gkId] = {
                playerId: gkId, name,
                matches: 0, goalsAgainst: 0, wins: 0, draws: 0, losses: 0, cleanSheets: 0
            };
        }
        const gk = gkStats[gkId];
        gk.matches++;
        gk.goalsAgainst += ga;
        if (ga === 0) gk.cleanSheets++;
        if (gf > ga) gk.wins++;
        else if (gf < ga) gk.losses++;
        else gk.draws++;
    }

    finished.forEach(t => {
        t.matches.filter(m => m.status === 'finished').forEach(match => {
            addGkData(match.homeGoalkeeper, match.awayScore, match.homeScore, t);
            addGkData(match.awayGoalkeeper, match.homeScore, match.awayScore, t);
        });
    });

    // Also include current tournament
    const cur = state.currentTournament;
    if (cur) {
        cur.matches.filter(m => m.status === 'finished').forEach(match => {
            addGkData(match.homeGoalkeeper, match.awayScore, match.homeScore, null);
            addGkData(match.awayGoalkeeper, match.homeScore, match.awayScore, null);
        });
    }

    return Object.values(gkStats).sort((a, b) => {
        const avgA = a.matches ? a.goalsAgainst / a.matches : 999;
        const avgB = b.matches ? b.goalsAgainst / b.matches : 999;
        if (avgA !== avgB) return avgA - avgB;
        return b.cleanSheets - a.cleanSheets;
    });
}

function getAllTimeGamesPlayed() {
    const finished = getFinishedHistory();
    const players = {}; // playerId → { name, gamesPlayed, tournamentsPlayed }

    function countPlayerInTournament(t) {
        // A player "plays" when they're on a team in a finished match
        const playerGames = {};
        t.matches.filter(m => m.status === 'finished').forEach(match => {
            const homeTeam = t.teams.find(tm => tm.id === match.homeTeamId);
            const awayTeam = t.teams.find(tm => tm.id === match.awayTeamId);
            if (homeTeam) homeTeam.players.forEach(pid => {
                playerGames[pid] = (playerGames[pid] || 0) + 1;
            });
            if (awayTeam) awayTeam.players.forEach(pid => {
                playerGames[pid] = (playerGames[pid] || 0) + 1;
            });
        });
        return playerGames;
    }

    finished.forEach(t => {
        const pg = countPlayerInTournament(t);
        Object.entries(pg).forEach(([pid, games]) => {
            const name = resolvePlayerName(pid, t);
            if (!players[pid]) players[pid] = { playerId: pid, name, gamesPlayed: 0, tournamentsPlayed: 0 };
            players[pid].gamesPlayed += games;
            players[pid].tournamentsPlayed++;
        });
    });

    // Current tournament
    const cur = state.currentTournament;
    if (cur && cur.matches.some(m => m.status === 'finished')) {
        const pg = countPlayerInTournament(cur);
        Object.entries(pg).forEach(([pid, games]) => {
            const name = getPlayerName(pid);
            if (!players[pid]) players[pid] = { playerId: pid, name, gamesPlayed: 0, tournamentsPlayed: 0 };
            players[pid].gamesPlayed += games;
            players[pid].tournamentsPlayed++;
        });
    }

    return Object.values(players).sort((a, b) => {
        if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
        return b.tournamentsPlayed - a.tournamentsPlayed;
    });
}

// ═══════════════════════════════════════════════════
// RENDER STATS — WITH SUB-TABS
// ═══════════════════════════════════════════════════
let statsSubTab = 'tournament'; // 'tournament' | 'alltime'

function switchStatsTab(tab) {
    statsSubTab = tab;
    renderStats();
}

function renderStats() {
    const container = document.getElementById('stats-content');
    const t = state.currentTournament;
    const hasCurrentData = t && t.matches.filter(m => m.status === 'finished').length > 0;
    const hasHistoryData = getFinishedHistory().length > 0 || hasCurrentData;

    let html = `
        <div class="stats-tabs">
            <button class="stats-tab ${statsSubTab === 'tournament' ? 'active' : ''}" onclick="switchStatsTab('tournament')">
                🏆 Torneio Atual
            </button>
            <button class="stats-tab ${statsSubTab === 'alltime' ? 'active' : ''}" onclick="switchStatsTab('alltime')">
                📈 Geral
            </button>
        </div>
    `;

    if (statsSubTab === 'tournament') {
        html += renderTournamentStats(hasCurrentData);
    } else {
        html += renderAllTimeStats(hasHistoryData);
    }

    container.innerHTML = html;
}

function renderTournamentStats(hasData) {
    if (!hasData) {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">🏆</div>
                <div class="empty-state-text">Nenhum jogo finalizado no torneio atual.</div>
            </div>`;
    }

    const scorers = getTopScorers();
    const gkStats = getGoalkeeperStats();
    let html = '';

    // Top scorers
    html += `
        <div class="stats-section">
            <h3>⚽ Artilharia</h3>
            ${scorers.length === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem;">Nenhum gol marcado ainda.</p>' : `
                <table class="stats-table">
                    <thead><tr><th>#</th><th>Jogador</th><th>Gols</th></tr></thead>
                    <tbody>
                        ${scorers.map((s, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>
                                    ${esc(s.name)}
                                    <div style="font-size:0.7rem;color:var(--text-muted);">
                                        ${s.teams.map(tid => esc(getTeamName(tid))).join(', ')}
                                    </div>
                                </td>
                                <td style="font-weight:800;color:var(--accent)">${s.goals}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>
    `;

    // Goalkeeper stats
    html += `
        <div class="stats-section">
            <h3>🧤 Goleiros</h3>
            ${gkStats.length === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem;">Nenhum dado de goleiro registrado.</p>' : `
                <table class="stats-table">
                    <thead>
                        <tr><th>#</th><th>Goleiro</th><th>J</th><th>GS</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr>
                    </thead>
                    <tbody>
                        ${gkStats.map((gk, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${esc(gk.name)}</td>
                                <td>${gk.matches}</td>
                                <td>${gk.goalsAgainst}</td>
                                <td style="color:var(--accent)">${gk.wins}</td>
                                <td>${gk.draws}</td>
                                <td style="color:var(--danger)">${gk.losses}</td>
                                <td>${gk.cleanSheets}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;">
                    J=Jogos | GS=Gols Sofridos | V=Vitórias | E=Empates | D=Derrotas | SG=Sem Gol (Clean Sheet)
                </p>
            `}
        </div>
    `;

    return html;
}

function renderAllTimeStats(hasData) {
    const finished = getFinishedHistory();

    if (!hasData) {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">📈</div>
                <div class="empty-state-text">Nenhum torneio registrado ainda.<br>Complete um torneio para ver as estatísticas gerais.</div>
            </div>`;
    }

    let html = '';

    // Summary card
    html += `
        <div class="card" style="text-align:center;margin-bottom:16px;">
            <div style="font-size:2rem;font-weight:900;color:var(--accent);">${finished.length}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">torneio${finished.length !== 1 ? 's' : ''} finalizado${finished.length !== 1 ? 's' : ''}</div>
        </div>
    `;

    // 1. Most Championships
    const champions = getAllTimeChampions();
    if (champions.length > 0) {
        html += `
            <div class="stats-section">
                <h3>🏆 Mais Títulos</h3>
                <table class="stats-table">
                    <thead><tr><th>#</th><th>Jogador</th><th>Títulos</th></tr></thead>
                    <tbody>
                        ${champions.slice(0, 15).map((c, i) => `
                            <tr>
                                <td>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                                <td>
                                    ${esc(c.name)}
                                    <div style="font-size:0.7rem;color:var(--text-muted);">
                                        ${c.teams.slice(-3).map(n => esc(n)).join(', ')}${c.teams.length > 3 ? '...' : ''}
                                    </div>
                                </td>
                                <td style="font-weight:800;color:var(--gold);">${c.titles}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // 2. Most Games Played
    const gamesPlayed = getAllTimeGamesPlayed();
    if (gamesPlayed.length > 0) {
        html += `
            <div class="stats-section">
                <h3>🎮 Mais Jogos</h3>
                <table class="stats-table">
                    <thead><tr><th>#</th><th>Jogador</th><th>Jogos</th><th>Torneios</th></tr></thead>
                    <tbody>
                        ${gamesPlayed.slice(0, 15).map((p, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${esc(p.name)}</td>
                                <td style="font-weight:700;">${p.gamesPlayed}</td>
                                <td style="color:var(--text-secondary);">${p.tournamentsPlayed}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // 3. All-time Top Scorers
    const scorers = getAllTimeTopScorers();
    if (scorers.length > 0) {
        html += `
            <div class="stats-section">
                <h3>⚽ Artilharia Geral</h3>
                <table class="stats-table">
                    <thead><tr><th>#</th><th>Jogador</th><th>Gols</th><th>Torneios</th></tr></thead>
                    <tbody>
                        ${scorers.slice(0, 15).map((s, i) => `
                            <tr>
                                <td>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                                <td>${esc(s.name)}</td>
                                <td style="font-weight:800;color:var(--accent);">${s.goals}</td>
                                <td style="color:var(--text-secondary);">${s.tournaments}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // 4. All-time Goalkeeper stats
    const gkStats = getAllTimeGoalkeeperStats();
    if (gkStats.length > 0) {
        html += `
            <div class="stats-section">
                <h3>🧤 Goleiros — Geral</h3>
                <table class="stats-table">
                    <thead>
                        <tr><th>#</th><th>Goleiro</th><th>J</th><th>GS</th><th>Média</th><th>V</th><th>SG</th></tr>
                    </thead>
                    <tbody>
                        ${gkStats.slice(0, 15).map((gk, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${esc(gk.name)}</td>
                                <td>${gk.matches}</td>
                                <td>${gk.goalsAgainst}</td>
                                <td style="font-weight:700;color:${gk.matches ? (gk.goalsAgainst / gk.matches <= 1 ? 'var(--accent)' : gk.goalsAgainst / gk.matches <= 2 ? 'var(--warning)' : 'var(--danger)') : 'var(--text-muted)'}">
                                    ${gk.matches ? (gk.goalsAgainst / gk.matches).toFixed(2) : '-'}
                                </td>
                                <td style="color:var(--accent);">${gk.wins}</td>
                                <td>${gk.cleanSheets}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;">
                    J=Jogos | GS=Gols Sofridos | Média=GS/J | V=Vitórias | SG=Sem Gol (Clean Sheet)
                </p>
            </div>
        `;
    }

    // 5. Tournament history list
    if (finished.length > 0) {
        html += `
            <div class="stats-section">
                <h3>📜 Histórico de Torneios</h3>
                ${finished.slice().reverse().map((t, i) => {
                    const date = t.finishedAt ? new Date(t.finishedAt).toLocaleDateString('pt-BR') : new Date(t.createdAt).toLocaleDateString('pt-BR');
                    return `
                        <div class="card" style="padding:10px 14px;margin-bottom:6px;cursor:pointer;" onclick="showTournamentDetails(${state.history.length - 1 - i})">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <div>
                                    <small style="color:var(--text-muted)">${date}</small>
                                    <div style="font-weight:600;font-size:0.85rem;">
                                        ${t.teams.map(tm => esc(tm.name)).join(' × ')}
                                    </div>
                                </div>
                                <div style="text-align:right;display:flex;align-items:center;gap:8px;">
                                    <div>
                                        ${t.champion ? `
                                            <div style="font-size:0.75rem;color:var(--gold);font-weight:700;">🏆 ${esc(t.champion.teamName)}</div>
                                            <div style="font-size:0.7rem;color:var(--text-muted);">${t.champion.pts}pts | ${t.champion.gf}gols</div>
                                        ` : ''}
                                    </div>
                                    <span style="font-size:1.2rem;color:var(--text-muted);">›</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    return html;
}

// ═══════════════════════════════════════════════════
// TOURNAMENT DETAILS (HISTORICAL)
// ═══════════════════════════════════════════════════
function showTournamentDetails(historyIndex) {
    const t = state.history[historyIndex];
    if (!t) return;

    const date = t.finishedAt ? new Date(t.finishedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : 
                 new Date(t.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    // Calculate standings
    const standings = calculateStandingsForTournament(t);
    
    // Get scorers
    const scorers = getTopScorersForTournament(t);
    
    // Get goalkeeper stats
    const gkStats = getGoalkeeperStatsForTournament(t);

    // Resolve player names from snapshot
    const getPlayerNameFromTournament = (playerId) => {
        return t.playerSnapshot?.[playerId] || getPlayerName(playerId);
    };

    let html = `
        <div class="modal-title">🏆 Detalhes do Torneio</div>
        <div style="text-align:center;margin-bottom:16px;">
            <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">${date}</div>
            <div style="font-size:1rem;font-weight:700;">${t.teams.map(tm => esc(tm.name)).join(' × ')}</div>
            ${t.champion ? `
                <div style="margin-top:8px;padding:8px;background:var(--bg-input);border-radius:8px;">
                    <div style="font-size:0.8rem;color:var(--gold);font-weight:700;">🏆 Campeão: ${esc(t.champion.teamName)}</div>
                    <div style="font-size:0.75rem;color:var(--text-secondary);">${t.champion.pts} pontos • ${t.champion.gf} gols</div>
                </div>
            ` : ''}
        </div>

        <div style="max-height:60vh;overflow-y:auto;padding:0 4px;">
    `;

    // 1. CLASSIFICAÇÃO
    if (standings.length > 0) {
        html += `
            <div style="margin-bottom:20px;">
                <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;color:var(--accent);">📊 Classificação</h4>
                <div style="overflow-x:auto;">
                    <table class="standings-table" style="font-size:0.8rem;">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Time</th>
                                <th>J</th>
                                <th>V</th>
                                <th>E</th>
                                <th>D</th>
                                <th>GF</th>
                                <th>GC</th>
                                <th>SG</th>
                                <th>PTS</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${standings.map((s, i) => `
                                <tr>
                                    <td><span class="pos-badge pos-${i + 1}">${i + 1}</span></td>
                                    <td>
                                        <span style="display:inline-flex;align-items:center;gap:4px;">
                                            <span class="score-team-color" style="background:${s.color}"></span>
                                            ${esc(s.name)}
                                        </span>
                                    </td>
                                    <td>${s.played}</td>
                                    <td>${s.won}</td>
                                    <td>${s.drawn}</td>
                                    <td>${s.lost}</td>
                                    <td>${s.gf}</td>
                                    <td>${s.ga}</td>
                                    <td>${s.gd > 0 ? '+' : ''}${s.gd}</td>
                                    <td class="pts">${s.pts}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // 2. ARTILHARIA
    if (scorers.length > 0) {
        html += `
            <div style="margin-bottom:20px;">
                <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;color:var(--accent);">⚽ Artilharia</h4>
                <table class="stats-table" style="font-size:0.8rem;">
                    <thead><tr><th>#</th><th>Jogador</th><th>Gols</th></tr></thead>
                    <tbody>
                        ${scorers.slice(0, 10).map((s, i) => `
                            <tr>
                                <td>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                                <td>${esc(getPlayerNameFromTournament(s.playerId))}</td>
                                <td style="font-weight:800;color:var(--accent)">${s.goals}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // 3. GOLEIROS
    if (gkStats.length > 0) {
        html += `
            <div style="margin-bottom:20px;">
                <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;color:var(--accent);">🧤 Goleiros</h4>
                <table class="stats-table" style="font-size:0.8rem;">
                    <thead>
                        <tr><th>#</th><th>Goleiro</th><th>J</th><th>GS</th><th>V</th><th>SG</th></tr>
                    </thead>
                    <tbody>
                        ${gkStats.slice(0, 10).map((gk, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${esc(getPlayerNameFromTournament(gk.playerId))}</td>
                                <td>${gk.matches}</td>
                                <td>${gk.goalsAgainst}</td>
                                <td style="color:var(--accent)">${gk.wins}</td>
                                <td>${gk.cleanSheets}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p style="font-size:0.65rem;color:var(--text-muted);margin-top:4px;">
                    J=Jogos | GS=Gols Sofridos | V=Vitórias | SG=Sem Gol
                </p>
            </div>
        `;
    }

    // 4. JOGOS
    const finishedMatches = t.matches.filter(m => m.status === 'finished');
    if (finishedMatches.length > 0) {
        html += `
            <div style="margin-bottom:20px;">
                <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;color:var(--accent);">⚽ Jogos</h4>
                ${finishedMatches.map(match => {
                    const homeTeam = t.teams.find(tm => tm.id === match.homeTeamId);
                    const awayTeam = t.teams.find(tm => tm.id === match.awayTeamId);
                    const winnerSide = match.homeScore > match.awayScore ? 'home' : 
                                       match.awayScore > match.homeScore ? 'away' : null;
                    
                    return `
                        <div style="padding:8px;margin-bottom:6px;background:var(--bg-input);border-radius:6px;font-size:0.8rem;">
                            <div style="font-weight:600;margin-bottom:4px;color:var(--text-muted);">Jogo ${match.round}</div>
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <div style="flex:1;${winnerSide === 'home' ? 'color:var(--accent);font-weight:700;' : ''}">
                                    <span class="score-team-color" style="background:${homeTeam?.color || '#888'};display:inline-block;margin-right:4px;"></span>
                                    ${esc(homeTeam?.name || '???')}
                                </div>
                                <div style="font-size:1.1rem;font-weight:800;padding:0 12px;">
                                    ${match.homeScore} × ${match.awayScore}
                                </div>
                                <div style="flex:1;text-align:right;${winnerSide === 'away' ? 'color:var(--accent);font-weight:700;' : ''}">
                                    ${esc(awayTeam?.name || '???')}
                                    <span class="score-team-color" style="background:${awayTeam?.color || '#888'};display:inline-block;margin-left:4px;"></span>
                                </div>
                            </div>
                            ${match.goals && match.goals.length > 0 ? `
                                <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border);font-size:0.7rem;color:var(--text-secondary);">
                                    Gols: ${match.goals.map(g => esc(getPlayerNameFromTournament(g.playerId))).join(', ')}
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    html += `
        </div>
        <div class="modal-actions" style="margin-top:16px;">
            <button class="btn btn-secondary btn-block" onclick="hideModal()">Fechar</button>
        </div>
    `;

    showModal(html);
}

// ═══════════════════════════════════════════════════
// CHAMPION
// ═══════════════════════════════════════════════════
function showChampionScreen() {
    const t = state.currentTournament;
    if (!t) return;

    const standings = calculateStandings();
    if (standings.length === 0) return;

    const champion = standings[0];
    const overlay = document.getElementById('champion-overlay');
    const content = document.getElementById('champion-content');

    content.innerHTML = `
        <div class="champion-trophy">🏆</div>
        <div class="champion-title">CAMPEÃO!</div>
        <div class="champion-team-name" style="color:${champion.color}">
            ${esc(champion.name)}
        </div>
        <div class="champion-stats">
            ${champion.pts} pontos | ${champion.won}V ${champion.drawn}E ${champion.lost}D<br>
            ${champion.gf} gols feitos | ${champion.ga} gols sofridos | Saldo: ${champion.gd > 0 ? '+' : ''}${champion.gd}
        </div>
        <button class="btn btn-gold btn-lg champion-close" onclick="hideChampion()">
            Fechar
        </button>
    `;

    overlay.classList.remove('hidden');
    startConfetti();
}

function hideChampion() {
    const overlay = document.getElementById('champion-overlay');
    overlay.classList.add('hidden');
    stopConfetti();
}

// ═══════════════════════════════════════════════════
// CONFETTI ANIMATION
// ═══════════════════════════════════════════════════
let confettiAnimId = null;
let confettiPieces = [];

function startConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    confettiPieces = [];
    const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8', '#00b894'];

    for (let i = 0; i < 150; i++) {
        confettiPieces.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            w: Math.random() * 10 + 5,
            h: Math.random() * 6 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            vy: Math.random() * 3 + 2,
            vx: (Math.random() - 0.5) * 2,
            angle: Math.random() * 360,
            va: (Math.random() - 0.5) * 10,
        });
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        confettiPieces.forEach(p => {
            p.y += p.vy;
            p.x += p.vx;
            p.angle += p.va;
            if (p.y > canvas.height + 20) {
                p.y = -20;
                p.x = Math.random() * canvas.width;
            }
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.angle * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        });
        confettiAnimId = requestAnimationFrame(animate);
    }
    animate();
}

function stopConfetti() {
    if (confettiAnimId) {
        cancelAnimationFrame(confettiAnimId);
        confettiAnimId = null;
    }
}

// ═══════════════════════════════════════════════════
// ADMIN — USER MANAGEMENT (FIREBASE)
// ═══════════════════════════════════════════════════
async function renderAdmin() {
    const container = document.getElementById('admin-content');
    if (!isAdmin()) {
        container.innerHTML = `<div class="notice notice-warning">⚠️ Acesso restrito ao Admin.</div>`;
        return;
    }

    // Load users from Firestore
    let users = [];
    try {
        const snap = await db.collection('users').get();
        users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    } catch (e) {
        container.innerHTML = `<div class="notice notice-warning">⚠️ Erro ao carregar usuários: ${esc(e.message)}</div>`;
        return;
    }

    container.innerHTML = `
        <div class="admin-form">
            <h3 style="margin-bottom:12px;font-size:0.95rem;">➕ Novo Usuário</h3>
            <div class="input-group">
                <input type="text" id="admin-new-displayname" placeholder="Nome de exibição" maxlength="30" autocomplete="off">
            </div>
            <div class="input-group">
                <input type="email" id="admin-new-email" placeholder="E-mail" maxlength="60" autocomplete="off">
            </div>
            <div class="input-group">
                <input type="password" id="admin-new-password" placeholder="Senha (mín. 6 caracteres)" maxlength="50" autocomplete="off">
            </div>
            <div class="input-group">
                <select id="admin-new-role">
                    <option value="user">👤 Usuário (somente visualização)</option>
                    <option value="captain">🎖️ Capitão (pode gerenciar partidas)</option>
                    <option value="admin">👑 Admin Geral (acesso total)</option>
                </select>
            </div>
            <button class="btn btn-primary btn-block" onclick="adminAddUser()">Criar Usuário</button>
        </div>

        <h3 style="margin-bottom:10px;font-size:0.95rem;">👥 Usuários Cadastrados (${users.length})</h3>
        ${users.map(u => {
            const role = ROLES[u.role] || ROLES.user;
            const isSelf = u.uid === currentUser.uid;
            const displayName = u.displayName || u.email?.split('@')[0] || u.uid;
            return `
                <div class="admin-user-card role-${u.role || 'user'}">
                    <div class="admin-user-info">
                        <span class="admin-user-name">${esc(displayName)} ${isSelf ? '(você)' : ''}</span>
                        <span class="admin-user-role-label">${role.icon} ${role.label}</span>
                        <span style="font-size:0.7rem;color:var(--text-muted);">${esc(u.email || '')}</span>
                    </div>
                    <div class="admin-user-actions">
                        ${!isSelf ? `
                            <select onchange="adminChangeRole('${u.uid}', this.value)" style="font-size:0.75rem;padding:4px 6px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:4px;">
                                <option value="user" ${u.role === 'user' ? 'selected' : ''}>Usuário</option>
                                <option value="captain" ${u.role === 'captain' ? 'selected' : ''}>Capitão</option>
                                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                            </select>
                            <button class="btn-remove" onclick="adminRemoveUser('${u.uid}', '${esc(displayName)}')" title="Remover">✕</button>
                        ` : '<span style="font-size:0.75rem;color:var(--text-muted);">—</span>'}
                    </div>
                </div>
            `;
        }).join('')}

        <div class="divider"></div>
        <div class="notice notice-info" style="font-size:0.78rem;">
            <strong>Permissões:</strong><br>
            👑 <strong>Admin Geral:</strong> Criar torneios, adicionar jogadores, editar partidas, alterar times, gerenciar usuários<br>
            🎖️ <strong>Capitão:</strong> Iniciar torneio, definir jogadores nos times, marcar gols, definir goleiros<br>
            👤 <strong>Usuário:</strong> Apenas visualizar torneios, partidas, tabela e stats
        </div>
    `;
}

async function adminAddUser() {
    if (!canManageUsers()) return;
    const displayNameEl = document.getElementById('admin-new-displayname');
    const emailEl = document.getElementById('admin-new-email');
    const passwordEl = document.getElementById('admin-new-password');
    const roleEl = document.getElementById('admin-new-role');

    const displayName = displayNameEl.value.trim();
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const role = roleEl.value;

    if (!displayName) { showToast('Informe o nome de exibição!'); return; }
    if (!email) { showToast('Informe o e-mail!'); return; }
    if (!password || password.length < 6) { showToast('Senha deve ter pelo menos 6 caracteres!'); return; }

    try {
        showToast('⏳ Criando usuário...');

        // Use a secondary Firebase app instance to create user without affecting admin's session
        const secondaryApp = firebase.initializeApp(firebase.app().options, 'SecondaryApp_' + Date.now());
        const secondaryAuth = secondaryApp.auth();

        const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);

        // Set display name
        await cred.user.updateProfile({ displayName });

        // Store user profile in Firestore
        await db.collection('users').doc(cred.user.uid).set({
            email,
            displayName,
            role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Sign out and delete secondary app
        await secondaryAuth.signOut();
        await secondaryApp.delete();

        showToast(`✅ Usuário "${displayName}" criado!`);
        displayNameEl.value = '';
        emailEl.value = '';
        passwordEl.value = '';
        renderAdmin();

    } catch (e) {
        console.error('Erro ao criar usuário:', e);
        let msg = 'Erro ao criar usuário.';
        if (e.code === 'auth/email-already-in-use') msg = 'Este e-mail já está em uso!';
        else if (e.code === 'auth/weak-password') msg = 'Senha muito fraca (mín. 6 caracteres).';
        else if (e.code === 'auth/invalid-email') msg = 'E-mail inválido.';
        showToast(`❌ ${msg}`);
    }
}

function adminRemoveUser(uid, displayName) {
    if (!canManageUsers()) return;
    if (uid === currentUser.uid) { showToast('Não pode remover a si mesmo!'); return; }

    showModal(`
        <div class="modal-title">⚠️ Remover Usuário?</div>
        <p style="text-align:center;color:var(--text-secondary);margin-bottom:16px;">
            Tem certeza que deseja remover <strong>${esc(displayName)}</strong>?<br>
            <small style="color:var(--text-muted);">O perfil será removido do Firestore. O usuário não poderá mais acessar.</small>
        </p>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
            <button class="btn btn-danger" onclick="confirmAdminRemoveUser('${uid}', '${esc(displayName)}')">Remover</button>
        </div>
    `);
}

async function confirmAdminRemoveUser(uid, displayName) {
    try {
        await db.collection('users').doc(uid).delete();
        hideModal();
        showToast(`Usuário "${displayName}" removido.`);
        renderAdmin();
    } catch (e) {
        console.error('Erro ao remover:', e);
        showToast('Erro ao remover usuário.');
    }
}

async function adminChangeRole(uid, newRole) {
    if (!canManageUsers()) return;
    try {
        await db.collection('users').doc(uid).update({ role: newRole });
        showToast(`Perfil alterado para ${ROLES[newRole]?.label || newRole}.`);
        renderAdmin();
    } catch (e) {
        console.error('Erro ao alterar perfil:', e);
        showToast('Erro ao alterar perfil.');
    }
}

// ═══════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════
function showModal(html) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = html;
    overlay.classList.remove('hidden');
}

function hideModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('hidden');
}

// ═══════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════
function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getContrastColor(hex) {
    // Simple contrast calculation
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
}

// ═══════════════════════════════════════════════════
// INITIALIZATION (FIREBASE)
// ═══════════════════════════════════════════════════
function init() {
    // Wire up nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Player input
    const playerInput = document.getElementById('input-player-name');
    const addBtn = document.getElementById('btn-add-player');

    addBtn.addEventListener('click', () => {
        addPlayer(playerInput.value);
        playerInput.value = '';
        playerInput.focus();
    });

    playerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            addPlayer(playerInput.value);
            playerInput.value = '';
        }
    });

    // Modal close on overlay click
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) hideModal();
    });

    // Login button
    document.getElementById('btn-login').addEventListener('click', handleLoginClick);
    document.getElementById('login-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLoginClick();
    });
    document.getElementById('login-email').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('login-password').focus();
    });

    // Google login button
    document.getElementById('btn-google-login').addEventListener('click', async () => {
        const errorEl = document.getElementById('login-error');
        errorEl.classList.add('hidden');
        const result = await doGoogleLogin();
        if (!result.success && result.message) {
            errorEl.textContent = result.message;
            errorEl.classList.remove('hidden');
        }
    });

    // Capture redirect auth errors (if popup fallback was used)
    auth.getRedirectResult().catch((e) => {
        console.error('Google redirect result error:', e);
        const msg = getGoogleAuthErrorMessage(e);
        if (!msg) return;
        const errorEl = document.getElementById('login-error');
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
    });

    // Logout button
    document.getElementById('btn-logout').addEventListener('click', logout);

    // Firebase Auth state observer — replaces loadSession()
    auth.onAuthStateChanged(async (firebaseUser) => {
        if (firebaseUser) {
            // User is signed in — load profile from Firestore
            try {
                const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
                if (userDoc.exists) {
                    const data = userDoc.data();
                    currentUser = {
                        uid: firebaseUser.uid,
                        email: firebaseUser.email,
                        displayName: data.displayName || firebaseUser.displayName || firebaseUser.email.split('@')[0],
                        role: data.role || 'user'
                    };
                } else {
                    // Profile doc missing — auto-create as first user = admin, otherwise user
                    const snap = await db.collection('users').get();
                    const autoRole = snap.size === 0 ? 'admin' : 'user';
                    const profile = {
                        email: firebaseUser.email,
                        displayName: firebaseUser.displayName || firebaseUser.email.split('@')[0],
                        role: autoRole,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    await db.collection('users').doc(firebaseUser.uid).set(profile);
                    currentUser = { uid: firebaseUser.uid, email: firebaseUser.email, displayName: profile.displayName, role: autoRole };
                }

                await loadState();
                resumeMatchTimerIfNeeded();
                await migrateLocalStorageToFirestore();
                startRealtimeSync();
                showAppScreen();

            } catch (e) {
                console.error('Erro ao carregar perfil do usuário:', e);
                // Fallback — keep basic info
                currentUser = {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    displayName: firebaseUser.displayName || firebaseUser.email.split('@')[0],
                    role: 'user'
                };
                await loadState();
                resumeMatchTimerIfNeeded();
                showAppScreen();
            }
        } else {
            // User is signed out
            currentUser = null;
            stopRealtimeSync();
            showLoginScreen();
        }
    });
}

async function handleLoginClick() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    if (!email || !password) {
        errorEl.textContent = 'Preencha e-mail e senha.';
        errorEl.classList.remove('hidden');
        return;
    }

    errorEl.classList.add('hidden');

    const result = await doLogin(email, password);
    if (!result.success) {
        errorEl.textContent = result.message;
        errorEl.classList.remove('hidden');
    }
    // If successful, onAuthStateChanged fires automatically and handles the rest
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
