// api/data.js

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const PLAYER_PASSWORD = process.env.PLAYER_PASSWORD || 'newells';
const STAFF_USER = process.env.STAFF_USER || 'newell';
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'staff';

/**
 * Función robusta para obtener todos los ítems.
 * Incluye la corrección para el error de JSON.parse.
 */
async function getAllItems(type) {
    const ids = await redis.smembers(`${type}:all`);
    if (!ids || ids.length === 0) return [];

    const pipeline = redis.pipeline();
    ids.forEach(id => pipeline.hgetall(`${type}:${id}`));
    const results = await pipeline.exec();

    return results.filter(r => r).map(item => {
        // --- INICIO DE LA CORRECCIÓN ---
        let parsedStats = {};
        if (typeof item.stats === 'string') {
            try {
                // Intenta parsear solo si es un string JSON válido
                parsedStats = JSON.parse(item.stats);
            } catch (e) {
                // Si falla (ej: es "[object Object]"), lo ignoramos y usamos un objeto vacío.
                console.error(`Error al parsear stats para item ${item.id}:`, item.stats);
                parsedStats = {};
            }
        } else if (typeof item.stats === 'object' && item.stats !== null) {
            // Si por alguna razón ya es un objeto, lo usamos directamente.
            parsedStats = item.stats;
        }
        // --- FIN DE LA CORRECCIÓN ---

        return {
            ...item,
            id: parseInt(item.id, 10),
            number_current: item.number_current ? parseInt(item.number_current, 10) : null,
            number_new: item.number_new ? parseInt(item.number_new, 10) : null,
            isExpelled: item.isExpelled === 'true',
            stats: parsedStats // Usamos las estadísticas parseadas de forma segura
        };
    });
}


async function initializeDatabase() {
    const initialData = getInitialData();
    const pipeline = redis.pipeline();

    initialData.players.forEach(p => {
        pipeline.sadd('players:all', p.id);
        pipeline.hset(`players:${p.id}`, {
            ...p,
            stats: JSON.stringify(p.stats || {})
        });
    });
    
    await pipeline.exec();
    console.log("Base de datos Redis inicializada con jugadores por defecto.");
}

export default async function handler(req, res) {
    const method = req.method;
    let body;
    try {
        body = req.body ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : {};
    } catch (e) {
        return res.status(400).json({ error: 'Cuerpo de la petición inválido.' });
    }

    try {
        if (method === 'GET') {
            const players = await getAllItems('players');
            const applications = await getAllItems('applications');
            return res.status(200).json({ players, applications });
        }
        
        // El resto del handler permanece igual
        if (method === 'POST') {
            const { type, payload } = body;
            if (type === 'player_login' && payload.password === PLAYER_PASSWORD) return res.status(200).json({ success: true });
            if (type === 'staff_login' && payload.user === STAFF_USER && payload.pass === STAFF_PASSWORD) return res.status(200).json({ success: true });
            if (type === 'player_login' || type === 'staff_login') return res.status(401).json({ error: 'Credenciales incorrectas.' });
            if (type === 'application') {
                const appId = Date.now();
                await redis.sadd('applications:all', appId);
                await redis.hset(`applications:${appId}`, { ...payload, id: appId });
                const applications = await getAllItems('applications');
                return res.status(200).json({ success: true, applications });
            }
        }
        
        if (method === 'PUT') {
            const { type, payload } = body;
            if (type === 'update_player') {
                await redis.hset(`players:${payload.id}`, { ...payload, stats: JSON.stringify(payload.stats) });
                const players = await getAllItems('players');
                return res.status(200).json({ success: true, players });
            }
        }
        
        if (method === 'DELETE') {
             const { type, payload } = body;
            if (type === 'process_application') {
                const { appId, approved, newPlayerData } = payload;
                if (approved) {
                    const newId = Date.now();
                    await redis.sadd('players:all', newId);
                    await redis.hset(`players:${newId}`, { ...newPlayerData, id: newId, stats: JSON.stringify(newPlayerData.stats) });
                }
                await redis.srem('applications:all', appId);
                await redis.del(`applications:${appId}`);
                const players = await getAllItems('players');
                const applications = await getAllItems('applications');
                return res.status(200).json({ success: true, players, applications });
            }
        }

        return res.status(405).json({ error: `Método ${method} no permitido.` });

    } catch (error) {
        console.error("Error en API con Redis:", error);
        return res.status(500).json({ error: 'Ha ocurrido un error en el servidor.' });
    }
}

function getInitialData() {
    const players = [
        { id: 1, name: 'Saul', position: 'MC', skill: 'Lectura de Juego', number_current: 5, number_new: null, isExpelled: false },
        { id: 2, name: 'Enrique', position: 'DC', skill: 'Tiro', number_current: 11, number_new: 7, isExpelled: false },
        { id: 3, name: 'Eleonor', position: 'MCO', skill: 'Pase Clave', number_current: 10, number_new: null, isExpelled: true }
    ];
    const playersWithStats = players.map(p => ({ ...p, stats: { goles: Math.floor(Math.random() * 10), partidos: 10, asistencias: Math.floor(Math.random() * 5) } }));
    return { players: playersWithStats, applications: [] };
}
