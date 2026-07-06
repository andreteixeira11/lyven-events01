/**
 * Teatro Baltazar Dias — planta de lugares (Funchal, Madeira)
 * Layout baseado na planta oficial do teatro.
 * Secções: Plateia, Balcão Central, Camarotes (Centrais + Laterais), Galeria
 *
 * Cada secção tem filas (rows) e lugares (seats) numerados.
 * O layout é gerado programaticamente para refletir a disposição em leque.
 */

export type SeatStatus = 'available' | 'selected' | 'booked' | 'reserved' | 'blocked';

export interface SeatDef {
  id: string;          // e.g. "plateia-A-1"
  label: string;       // e.g. "1"
  section: string;     // e.g. "Plateia"
  rowLabel: string;    // e.g. "A"
  seatNumber: string;  // e.g. "1"
  sortIndex: number;
  ticketTypeId?: string; // optional: which ticket type this seat belongs to
}

export interface SeatRow {
  id: string;          // e.g. "plateia-A"
  label: string;       // e.g. "A"
  seats: SeatDef[];
}

export interface SeatSection {
  id: string;          // e.g. "plateia"
  name: string;        // e.g. "Plateia"
  rows: SeatRow[];
  // visual cue: how to render this section
  shape: 'fan' | 'straight' | 'box';
  // optional color accent
  accent?: string;
}

export interface VenueSeatMap {
  id: string;
  venueName: string;
  sections: SeatSection[];
}

/**
 * Gera uma fila de lugares numerados da esquerda para a direita.
 */
function genRow(
  sectionId: string,
  sectionName: string,
  rowLabel: string,
  seatCount: number,
  startNumber = 1,
  skipSeats: number[] = [], // seats to skip (aisles, gaps)
): SeatRow {
  const seats: SeatDef[] = [];
  let num = startNumber;
  for (let i = 0; i < seatCount; i++) {
    const seatNumberStr = String(num);
    const seatId = `${sectionId}-${rowLabel}-${seatNumberStr}`;
    if (!skipSeats.includes(num)) {
      seats.push({
        id: seatId,
        label: seatNumberStr,
        section: sectionName,
        rowLabel,
        seatNumber: seatNumberStr,
        sortIndex: num,
      });
    }
    num++;
  }
  return {
    id: `${sectionId}-${rowLabel}`,
    label: rowLabel,
    seats,
  };
}

/**
 * Plateia (Stalls) — 14 filas (A–N), disposição em leque.
 * Filas crescem do palco para a plateia traseira.
 * Fila A: 18 lugares | Fila B–D: 20 | Fila E–G: 22 | Fila H–K: 24 | Fila L–N: 22
 * Corredor central após o lugar 11 (esquerda/direita).
 */
function buildPlateia(): SeatSection {
  const rowConfigs: { label: string; count: number }[] = [
    { label: 'A', count: 18 },
    { label: 'B', count: 20 },
    { label: 'C', count: 20 },
    { label: 'D', count: 20 },
    { label: 'E', count: 22 },
    { label: 'F', count: 22 },
    { label: 'G', count: 22 },
    { label: 'H', count: 24 },
    { label: 'I', count: 24 },
    { label: 'J', count: 24 },
    { label: 'K', count: 24 },
    { label: 'L', count: 22 },
    { label: 'M', count: 22 },
    { label: 'N', count: 22 },
  ];

  const rows = rowConfigs.map(({ label, count }) =>
    genRow('plateia', 'Plateia', label, count)
  );

  return {
    id: 'plateia',
    name: 'Plateia',
    rows,
    shape: 'fan',
    accent: '#0099a8',
  };
}

/**
 * Balcão Central — 5 filas (A–E), 16 lugares cada.
 * Corredor central após o lugar 8.
 */
function buildBalcaoCentral(): SeatSection {
  const rowLabels = ['A', 'B', 'C', 'D', 'E'];
  const rows = rowLabels.map((label) =>
    genRow('balcao-central', 'Balcão Central', label, 16)
  );
  return {
    id: 'balcao-central',
    name: 'Balcão Central',
    rows,
    shape: 'straight',
    accent: '#007A87',
  };
}

/**
 * Camarotes Centrais — 4 camarotes de cada lado do palco.
 * Cada camarote tem 4 lugares.
 * Nomenclatura: Camarote Central Esquerdo 1–4 / Camarote Central Direito 1–4.
 */
function buildCamarotesCentrais(): SeatSection[] {
  const sections: SeatSection[] = [];

  // Esquerdo
  const leftRows: SeatRow[] = [1, 2, 3, 4].map((boxNum) => {
    const rowLabel = String(boxNum);
    const seats: SeatDef[] = [1, 2, 3, 4].map((seatNum, idx) => ({
      id: `camarote-central-esq-${rowLabel}-${seatNum}`,
      label: String(seatNum),
      section: 'Camarote Central Esq.',
      rowLabel: `C${rowLabel}`,
      seatNumber: String(seatNum),
      sortIndex: idx,
    }));
    return { id: `camarote-central-esq-${rowLabel}`, label: `C${rowLabel}`, seats };
  });

  sections.push({
    id: 'camarote-central-esq',
    name: 'Camarotes Centrais Esq.',
    rows: leftRows,
    shape: 'box',
    accent: '#6B7280',
  });

  // Direito
  const rightRows: SeatRow[] = [1, 2, 3, 4].map((boxNum) => {
    const rowLabel = String(boxNum);
    const seats: SeatDef[] = [1, 2, 3, 4].map((seatNum, idx) => ({
      id: `camarote-central-dir-${rowLabel}-${seatNum}`,
      label: String(seatNum),
      section: 'Camarote Central Dir.',
      rowLabel: `C${rowLabel}`,
      seatNumber: String(seatNum),
      sortIndex: idx,
    }));
    return { id: `camarote-central-dir-${rowLabel}`, label: `C${rowLabel}`, seats };
  });

  sections.push({
    id: 'camarote-central-dir',
    name: 'Camarotes Centrais Dir.',
    rows: rightRows,
    shape: 'box',
    accent: '#6B7280',
  });

  return sections;
}

/**
 * Galeria — 4 filas (A–D), 14 lugares cada.
 * Vista superior, mais económica.
 */
function buildGaleria(): SeatSection {
  const rowLabels = ['A', 'B', 'C', 'D'];
  const rows = rowLabels.map((label) =>
    genRow('galeria', 'Galeria', label, 14)
  );
  return {
    id: 'galeria',
    name: 'Galeria',
    rows,
    shape: 'straight',
    accent: '#9CA3AF',
  };
}

/**
 * Mapa completo do Teatro Baltazar Dias.
 */
export const BALTAZAR_DIAS_SEAT_MAP: VenueSeatMap = {
  id: 'teatro-baltazar-dias',
  venueName: 'Teatro Baltazar Dias',
  sections: [
    buildPlateia(),
    buildBalcaoCentral(),
    ...buildCamarotesCentrais(),
    buildGaleria(),
  ],
};

/**
 * Lista flatten de todos os lugares (para inicializar event_seats no Supabase).
 */
export function flattenSeats(map: VenueSeatMap): SeatDef[] {
  const all: SeatDef[] = [];
  let globalSort = 0;
  for (const section of map.sections) {
    for (const row of section.rows) {
      for (const seat of row.seats) {
        all.push({ ...seat, sortIndex: globalSort++ });
      }
    }
  }
  return all;
}

/**
 * Total de lugares no teatro.
 */
export const BALTAZAR_DIAS_TOTAL_SEATS = flattenSeats(BALTAZAR_DIAS_SEAT_MAP).length;

/**
 * Verifica se um evento é no Teatro Baltazar Dias (por nome do venue).
 * Case-insensitive, normaliza acentos.
 */
export function isBaltazarDiasVenue(venueName: string): boolean {
  if (!venueName) return false;
  const normalized = venueName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return normalized.includes('baltazar dias') || normalized.includes('teatro baltazar');
}

/**
 * Conhecimentos: mapeia secção → ticket type id sugerido.
 * Permite associar lugares a tipos de bilhete quando o promotor usa o layout.
 */
export const SECTION_TICKET_TYPE_MAP: Record<string, string> = {
  'Plateia': 'plateia',
  'Balcão Central': 'balcao',
  'Camarote Central Esq.': 'camarote',
  'Camarote Central Dir.': 'camarote',
  'Galeria': 'galeria',
};
