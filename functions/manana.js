// GET /manana → página fija para Google con las cifras del día (ver lib/paginas.js).
import { servirPagina } from '../lib/paginas.js';

export const onRequestGet = ({ waitUntil }) => servirPagina('manana', waitUntil);
