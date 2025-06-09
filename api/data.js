/**
 * @file api/data.js
 * @description Handler completo de la API para Newell's Hub.
 * @version 4.0.0 (Final y Unificada)
 */

import { Redis } from '@upstash/redis';

// Se conecta a Redis usando las variables de entorno que Vercel provee
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
        // Lógica robusta para parsear las estadísticas
        let parsedStats = {};
        if (typeof item.stats === 'string') {
            try {
                parsedStats = JSON.parse(item.stats);
            } catch (e) {
                console.error(`Error al parsear stats para item ${item.id}:`, item.stats);
                parsedStats = {}; // Default a objeto vacío si falla
            }
        } else if (typeof item.stats === 'object' && item.stats !== null) {
            parsedStats = item.stats;
        }
        
        return {
            ...item,
            id: parseInt(item.id, 10),
            number_current: item.number_current ? parseInt(item.number_current, 10) : null,
            number_new: item.number_new ? parseInt(item.number_new, 10) : null,
            // Lógica robusta para convertir el campo 'isExpelled' a booleano
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
        pipeline.hset(`players:${p.id}`, { ...p, stats: JSON.stringify(p.stats || {}) });
    });
    await pipeline.exec();
    console.log("Base de datos Redis inicializada con datos por defecto.");
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
        // === MANEJO DE PETICIONES GET ===
        if (method === 'GET') {
            let players = await getAllItems('players');
            if (players.length === 0) {
                await initializeDatabase();
                players = await getAllItems('players');
            }
            const applications = await getAllItems('applications');
            return res.status(200).json({ players, applications });
        }
        
        // === MANEJO DE PETICIONES POST ===
        if (method === 'POST') {
            const { type, payload } = body;

            // Logins
            if (type === 'player_login') {
                return payload.password === PLAYER_PASSWORD
                    ? res.status(200).json({ success: true })
                    : res.status(401).json({ error: 'Contraseña incorrecta.' });
            }
            if (type === 'staff_login') {
                return payload.user === STAFF_USER && payload.pass === STAFF_PASSWORD
                    ? res.status(200).json({ success: true })
                    : res.status(401).json({ error: 'Credenciales de Staff incorrectas.' });
            }

            // Nueva aplicación
            if (type === 'application') {
                const appId = Date.now();
                await redis.sadd('applications:all', appId);
                await redis.hset(`applications:${appId}`, { ...payload, id: appId });
                const applications = await getAllItems('applications');
                return res.status(200).json({ success: true, applications });
            }
        }
        
        // === MANEJO DE PETICIONES PUT ===
        if (method === 'PUT') {
            const { type, payload } = body;
            if (type === 'update_player') {
                // Lógica explícita y segura para guardar los datos del jugador
                const playerDataToSave = {
                    id: payload.id,
                    name: payload.name,
                    position: payload.position,
                    skill: payload.skill,
                    number_current: payload.number_current,
                    number_new: payload.number_new,
                    isExpelled: payload.isExpelled,
                    stats: JSON.stringify(payload.stats || {})
                };
                
                // hset actualiza un registro si existe, o lo crea si no.
                await redis.hset(`players:${payload.id}`, playerDataToSave);
                
                const players = await getAllItems('players');
                return res.status(200).json({ success: true, players });
            }
        }
        
        // === MANEJO DE PETICIONES DELETE ===
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

        // Si no se manejó la petición, devuelve un error.
        return res.status(405).json({ error: `Método ${method} no permitido.` });

    } catch (error) {
        console.error("Error en API con Redis:", error);
        return res.status(500).json({ error: 'Ha ocurrido un error en el servidor.' });
    }
}


// --- DATOS INICIALES ---

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
