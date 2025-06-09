// api/data.js

// ¡ESTA LÍNEA ES LA CLAVE DE TODO!
// Al importar 'kv' desde '@vercel/kv', estás importando un objeto ya configurado.
// Vercel lee automáticamente las variables de entorno (KV_URL, KV_TOKEN, etc.)
// que él mismo añadió a tu proyecto cuando conectaste la base de datos.
// No necesitas poner URLs o tokens aquí, ¡la conexión ya está lista!
import { kv } from '@vercel/kv';

// --- ADVERTENCIA DE SEGURIDAD ---
// Es buena práctica gestionar las contraseñas como variables de entorno.
// Para un proyecto en producción, considera usar 'bcrypt' para encriptarlas.
const PLAYER_PASSWORD = process.env.PLAYER_PASSWORD || 'newells';
const STAFF_USER = process.env.STAFF_USER || 'newell';
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'staff';


// --- FUNCIONES AUXILIARES DE LA BASE DE DATOS ---

/**
 * Obtiene todos los ítems (jugadores/aplicaciones) usando la estructura de
 * Sets y Hashes de Redis, a través del SDK de Vercel KV.
 * @param {'players'|'applications'} type El tipo de dato a obtener.
 * @returns {Promise<Array<Object>>} Un array con los objetos.
 */
async function getAllItems(type) {
    // kv.smembers obtiene todos los IDs del conjunto 'players:all' o 'applications:all'
    const ids = await kv.smembers(`${type}:all`);
    if (!ids || ids.length === 0) return [];

    // Usamos un pipeline para hacer múltiples peticiones a la vez, es muy eficiente.
    const pipeline = kv.pipeline();
    // Para cada ID, pedimos todos los campos de su hash (ej: 'players:1')
    ids.forEach(id => pipeline.hgetall(`${type}:${id}`));
    const results = await pipeline.exec();

    // Filtramos resultados nulos y convertimos los datos a sus tipos correctos
    return results.filter(r => r).map(item => ({
        ...item,
        id: parseInt(item.id, 10),
        number_current: item.number_current ? parseInt(item.number_current, 10) : null,
        number_new: item.number_new ? parseInt(item.number_new, 10) : null,
        isExpelled: item.isExpelled === 'true',
        stats: JSON.parse(item.stats || '{}')
    }));
}

/**
 * Pobla la base de datos con datos iniciales si está vacía.
 */
async function initializeDatabase() {
    const initialData = getInitialData();
    const pipeline = kv.pipeline();

    initialData.players.forEach(p => {
        // Añade el ID del jugador al conjunto 'players:all'
        pipeline.sadd('players:all', p.id);
        // Crea un hash para el jugador (ej: 'players:1') con todos sus datos
        pipeline.hset(`players:${p.id}`, {
            ...p,
            stats: JSON.stringify(p.stats || {})
        });
    });
    
    await pipeline.exec();
    console.log("Base de datos KV inicializada con jugadores por defecto.");
}


// --- HANDLER PRINCIPAL DE LA API (Serverless Function) ---
export default async function handler(req, res) {
    const method = req.method;
    let body;
    try {
        // Un parseo de body más robusto
        body = req.body ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : {};
    } catch (e) {
        return res.status(400).json({ error: 'Cuerpo de la petición inválido.' });
    }

    try {
        if (method === 'GET') {
            let players = await getAllItems('players');
            // Si la base de datos está vacía, la llenamos con datos de ejemplo
            if (players.length === 0) {
                await initializeDatabase();
                players = await getAllItems('players');
            }
            const applications = await getAllItems('applications');
            return res.status(200).json({ players, applications });
        }
        
        if (method === 'POST') {
            const { type, payload } = body;

            // Logins (la validación ocurre aquí, en el servidor)
            if (type === 'player_login' && payload.password === PLAYER_PASSWORD) {
                return res.status(200).json({ success: true });
            }
            if (type === 'staff_login' && payload.user === STAFF_USER && payload.pass === STAFF_PASSWORD) {
                return res.status(200).json({ success: true });
            }
            if (type === 'player_login' || type === 'staff_login') {
                 return res.status(401).json({ error: 'Credenciales incorrectas.' });
            }

            // Nueva aplicación
            if (type === 'application') {
                const appId = Date.now();
                await kv.sadd('applications:all', appId);
                await kv.hset(`applications:${appId}`, { ...payload, id: appId });
                const applications = await getAllItems('applications');
                return res.status(200).json({ success: true, applications });
            }
        }
        
        if (method === 'PUT') {
            const { type, payload } = body;

            // Actualizar un único jugador
            if (type === 'update_player') {
                await kv.hset(`players:${payload.id}`, { ...payload, stats: JSON.stringify(payload.stats) });
                const players = await getAllItems('players');
                return res.status(200).json({ success: true, players });
            }
        }
        
        if (method === 'DELETE') {
             const { type, payload } = body;

            // Procesar (aprobar/rechazar) una aplicación
            if (type === 'process_application') {
                const { appId, approved, newPlayerData } = payload;
                if (approved) {
                    const newId = Date.now();
                    await kv.sadd('players:all', newId);
                    await kv.hset(`players:${newId}`, { ...newPlayerData, id: newId, stats: JSON.stringify(newPlayerData.stats) });
                }
                
                await kv.srem('applications:all', appId);
                await kv.del(`applications:${appId}`);
                
                const players = await getAllItems('players');
                const applications = await getAllItems('applications');
                return res.status(200).json({ success: true, players, applications });
            }
        }

        // Si no coincide ningún método o tipo, devolvemos un error
        return res.status(405).json({ error: `Método ${method} o tipo de acción no permitido.` });

    } catch (error) {
        console.error("Error en API Vercel KV:", error);
        return res.status(500).json({ error: 'Ha ocurrido un error en el servidor.' });
    }
}

// Datos iniciales para poblar la BD
function getInitialData() {
    const players = [
        { id: 1, name: 'Saul', position: 'MC', skill: 'Lectura de Juego', number_current: 5, number_new: null, isExpelled: false },
        { id: 2, name: 'Enrique', position: 'DC', skill: 'Tiro', number_current: 11, number_new: 7, isExpelled: false },
        { id: 3, name: 'Eleonor', position: 'MCO', skill: 'Pase Clave', number_current: 10, number_new: null, isExpelled: true },
        { id: 4, name: 'Masias', position: 'DFC', skill: 'Entradas', number_current: 4, number_new: null, isExpelled: false },
        { id: 5, name: 'Angel Cueto', position: 'ED', skill: 'Velocidad', number_current: 77, number_new: null, isExpelled: false },
        { id: 6, name: 'Pineda', position: 'DC', skill: 'Cabezazo', number_current: 9, number_new: null, isExpelled: false }
    ];
    const playersWithStats = players.map(p => ({ ...p, stats: { goles: Math.floor(Math.random() * 10), partidos: 10, asistencias: Math.floor(Math.random() * 5) } }));
    return { players: playersWithStats, applications: [] };
}
