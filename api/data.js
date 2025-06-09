// api/data.js

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// --- Variables de Entorno para Seguridad ---
const PLAYER_PASSWORD = process.env.PLAYER_PASSWORD || 'newells';
const STAFF_USER = process.env.STAFF_USER || 'newell';
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'staff';


// --- FUNCIONES AUXILIARES DE LA BASE DE DATOS ---

async function getAllItems(type) {
    const ids = await redis.smembers(`${type}:all`);
    if (!ids || ids.length === 0) return [];

    const pipeline = redis.pipeline();
    ids.forEach(id => pipeline.hgetall(`${type}:${id}`));
    const results = await pipeline.exec();

    return results.filter(r => r).map(item => {
        let parsedStats = {};
        if (typeof item.stats === 'string') {
            try {
                parsedStats = JSON.parse(item.stats);
            } catch (e) {
                console.error(`Error al parsear stats para item ${item.id}:`, item.stats);
                parsedStats = {};
            }
        } else if (typeof item.stats === 'object' && item.stats !== null) {
            parsedStats = item.stats;
        }
        
        return {
            ...item,
            id: parseInt(item.id, 10),
            number_current: item.number_current ? parseInt(item.number_current, 10) : null,
            number_new: item.number_new ? parseInt(item.number_new, 10) : null,
            // --- CORRECCIÓN #1 (LECTURA) ---
            // Aseguramos que el valor leído de Redis (que es un texto) se convierta
            // correctamente a un booleano. "true" (texto) se convierte en true (booleano).
            // Cualquier otro valor (incluido "false", null, o undefined) se convierte en false.
            isExpelled: item.isExpelled === 'true',
            stats: parsedStats
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
    console.log("Base de datos Redis inicializada.");
}


// --- HANDLER PRINCIPAL DE LA API ---

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
        
        if (method === 'POST') {
            // ... (sin cambios aquí)
        }
        
        if (method === 'PUT') {
            const { type, payload } = body;
            if (type === 'update_player') {

                // --- CORRECCIÓN #2 (ESCRITURA) ---
                // En lugar de pasar el 'payload' directamente, creamos un objeto limpio.
                // Esto asegura que cada campo, incluido 'isExpelled', se maneje explícitamente,
                // evitando errores sutiles. La librería @upstash/redis convertirá
                // el booleano 'isExpelled' al texto "true" o "false" para guardarlo.
                const playerDataToSave = {
                    id: payload.id,
                    name: payload.name,
                    position: payload.position,
                    skill: payload.skill,
                    number_current: payload.number_current,
                    number_new: payload.number_new,
                    isExpelled: payload.isExpelled, // El valor booleano del frontend
                    stats: JSON.stringify(payload.stats || {})
                };
                
                await redis.hset(`players:${payload.id}`, playerDataToSave);
                
                // Después de guardar, obtenemos la lista actualizada para devolverla
                const players = await getAllItems('players');
                return res.status(200).json({ success: true, players });
            }
        }
        
        if (method === 'DELETE') {
            // ... (sin cambios aquí)
        }

        // --- Manejo de métodos no implementados ---
        // (El resto del código del handler, como logins y manejo de aplicaciones, va aquí sin cambios)
        // ...

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
