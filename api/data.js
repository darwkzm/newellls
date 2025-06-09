import { kv } from '@vercel/kv';

const DB_KEY = 'newells-hub-data';

export default async function handler(req, res) {
  try {
    let db = await kv.get(DB_KEY);

    // Carga inicial si la base no existe
    if (!db || !db.players || !Array.isArray(db.players)) {
      db = getInitialData();
      await kv.set(DB_KEY, db);
      console.log('Base de datos inicial creada en Vercel KV');
    }

    if (req.method === 'GET') {
      return res.status(200).json(db);
    }

    const { type, payload } = req.body || {};

    if (!type || !payload) {
      return res.status(400).json({ error: 'Faltan datos en la solicitud' });
    }

    if (req.method === 'POST') {
      if (type === 'application') {
        if (!payload.name || !payload.number || !payload.position || !payload.skill) {
          return res.status(400).json({ error: 'Solicitud inválida. Faltan campos obligatorios.' });
        }
        db.applications.push({ ...payload, id: Date.now() });
      } else if (type === 'new_player') {
        const newId = db.players.length > 0 ? Math.max(...db.players.map(p => p.id)) + 1 : 1;
        db.players.push({
          id: newId,
          name: payload.name,
          position: payload.position,
          skill: payload.skill,
          number_current: payload.number_current || null,
          number_new: null,
          isExpelled: false,
          stats: { goles: 0, partidos: 0, asistencias: 0 }
        });
      } else {
        return res.status(400).json({ error: 'Tipo de POST inválido' });
      }
    } else if (req.method === 'PUT') {
      if (type === 'players') {
        if (!Array.isArray(payload)) return res.status(400).json({ error: 'Payload inválido' });
        db.players = payload.map(p => ({
          ...p,
          stats: p.stats || { goles: 0, partidos: 0, asistencias: 0 },
          number_current: p.number_current || null,
          number_new: p.number_new || null,
          isExpelled: !!p.isExpelled
        }));
      } else if (type === 'applications') {
        if (!Array.isArray(payload)) return res.status(400).json({ error: 'Payload inválido' });
        db.applications = payload;
      } else {
        return res.status(400).json({ error: 'Tipo de PUT inválido' });
      }
    } else {
      return res.setHeader('Allow', ['GET', 'POST', 'PUT']).status(405).end(`Método ${req.method} no permitido`);
    }

    await kv.set(DB_KEY, db);
    return res.status(200).json({ success: true, db });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
}

function getInitialData() {
  const POSITIONS = ['POR', 'DFC', 'LTD', 'LTI', 'MCD', 'MC', 'MCO', 'ED', 'EI', 'DC'];
  const players = [
    { id: 1, name: 'Saul', position: 'MC', skill: 'Lectura de Juego', number_current: 5, number_new: null, isExpelled: false },
    { id: 2, name: 'Enrique', position: 'DC', skill: 'Tiro', number_current: 11, number_new: 7, isExpelled: false },
    { id: 3, name: 'Eleonor', position: 'MCO', skill: 'Pase Clave', number_current: 10, number_new: null, isExpelled: true },
    { id: 4, name: 'Masias', position: 'DFC', skill: 'Entradas', number_current: 4, number_new: null, isExpelled: false },
    { id: 5, name: 'Angel Cueto', position: 'ED', skill: 'Velocidad', number_current: 77, number_new: null, isExpelled: false },
    { id: 6, name: 'Pineda', position: 'DC', skill: 'Cabezazo', number_current: 9, number_new: null, isExpelled: false },
    { id: 7, name: 'Kevin', position: 'LTD', skill: 'Resistencia', number_current: null, number_new: 17, isExpelled: false },
    { id: 8, name: 'Brandito', position: 'DFC', skill: 'Fuerza', number_current: 47, number_new: null, isExpelled: false },
    { id: 9, name: 'Iam', position: 'MCD', skill: 'Recuperación', number_current: 20, number_new: null, isExpelled: false },
    { id: 10, name: 'Jeshua', position: 'POR', skill: 'Reflejos', number_current: 1, number_new: null, isExpelled: false },
    { id: 11, name: 'Oliver', position: 'MC', skill: 'Visión', number_current: 8, number_new: null, isExpelled: false },
    { id: 12, name: 'Roger', position: 'EI', skill: 'Regate', number_current: null, number_new: 22, isExpelled: false },
    { id: 13, name: 'Sinue', position: 'LTI', skill: 'Centros', number_current: null, number_new: null, isExpelled: false }
  ];
  return {
    players: players.map(p => ({
      ...p,
      stats: { goles: 0, partidos: 0, asistencias: 0 }
    })),
    applications: []
  };
}
