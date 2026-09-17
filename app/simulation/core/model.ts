import {canonical, DIMENSIONS, rateDimension, type Quantity} from './units';

export type Evidence = {
  id: string; kind: 'synthetic' | 'published-model' | 'human-experiment' | 'animal-experiment' | 'inferred';
  source: string; conditions: string; species: string; limitations: string;
};
export type ChemicalModel = {
  id: string; version: string; description: string;
  evidence: Evidence[];
  species: {id: string; name: string; moieties: Record<string, number>}[];
  compartments: {id: string; name: string; volume: Quantity; kind: 'blood' | 'interstitial' | 'accounting-sink'}[];
  pools: {id: string; species: string; compartment: string; initial: Quantity}[];
  modules: {id: string; owns: string[]}[];
  /** The pool's owner authorizes a named module to exchange material at this port. */
  ports: {id: string; pool: string; owner: string; grants: string[]; direction: 'in' | 'out' | 'both'}[];
  parameters: {id: string; value: Quantity; range: readonly [number, number]; evidence: string}[];
  reactions: {
    id: string; owner: string; evidence: string; name: string;
    kind: 'transfer' | 'mass-action'; parameter: string; compartment: string;
    reactants: {pool: string; coefficient: number; port?: string}[];
    products: {pool: string; coefficient: number; port?: string}[];
  }[];
};
export type CompiledModel = {
  definition: ChemicalModel; signature: string; poolIds: string[]; initial: number[];
  volumes: number[]; stoichiometry: number[][]; rates: (amounts: readonly number[]) => number[];
};
export function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJSON((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function unique<T extends {id: string}>(values: T[], label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const v of values) {
    if (!/^[a-zA-Z][\w.-]*$/.test(v.id) || result.has(v.id)) throw new Error(`${label}: invalid or duplicate id ${v.id}.`);
    result.set(v.id, v);
  }
  return result;
}
export function compileModel(input: ChemicalModel): CompiledModel {
  const m = structuredClone(input); // Caller edits cannot change a compiled model's rates.
  if (!m.id || !m.version || !m.description || !m.pools.length || m.pools.length > 256 || m.reactions.length > 512)
    throw new Error('Model identity, description and a bounded set of pools are required.');
  const evidence = unique(m.evidence, 'Evidence'), species = unique(m.species, 'Species');
  const compartments = unique(m.compartments, 'Compartment'), pools = unique(m.pools, 'Pool');
  const modules = unique(m.modules, 'Module'), ports = unique(m.ports, 'Port'), params = unique(m.parameters, 'Parameter');
  unique(m.reactions, 'Reaction');
  for (const e of evidence.values()) {
    if (!['synthetic', 'published-model', 'human-experiment', 'animal-experiment', 'inferred'].includes(e.kind) || !e.source || !e.conditions || !e.species || !e.limitations)
      throw new Error(`Evidence ${e.id}: provenance, conditions and limitations are required.`);
  }
  for (const s of species.values()) {
    if (!Object.keys(s.moieties).length || Object.values(s.moieties).some(n => !Number.isInteger(n) || n <= 0))
      throw new Error(`Species ${s.id}: positive integer conserved-moiety counts required.`);
  }
  const volume = new Map([...compartments].map(([id, c]) => {
    const v = canonical(c.volume, DIMENSIONS.volume, `${id} volume`);
    if (v <= 0) throw new Error(`${id}: positive volume required.`);
    if (!['blood', 'interstitial', 'accounting-sink'].includes(c.kind)) throw new Error(`${id}: unsupported compartment kind.`);
    return [id, v] as const;
  }));
  const owner = new Map<string, string>();
  for (const module of modules.values()) for (const id of module.owns) {
    if (!pools.has(id) || owner.has(id)) throw new Error(`Pool ${id}: unknown pool or duplicate state ownership.`);
    owner.set(id, module.id);
  }
  const poolIds = [...pools.keys()], poolIndex = new Map(poolIds.map((id, i) => [id, i]));
  const initial = m.pools.map(p => {
    if (!species.has(p.species) || !compartments.has(p.compartment) || !owner.has(p.id)) throw new Error(`Pool ${p.id}: unresolved species, compartment or owner.`);
    return canonical(p.initial, DIMENSIONS.amount, `${p.id} initial amount`);
  });
  for (const p of ports.values()) {
    if (!pools.has(p.pool) || owner.get(p.pool) !== p.owner || !['in', 'out', 'both'].includes(p.direction) || !p.grants.length || p.grants.some(id => !modules.has(id)))
      throw new Error(`Port ${p.id}: invalid owner, grant or direction.`);
  }
  for (const p of params.values()) {
    if (!evidence.has(p.evidence) || p.range.length !== 2 || p.range.some(v => !Number.isFinite(v) || v < 0) || p.range[0] > p.range[1] || p.value.value < p.range[0] || p.value.value > p.range[1])
      throw new Error(`Parameter ${p.id}: evidence or declared range is invalid.`);
  }
  const stoichiometry: number[][] = [];
  const laws = m.reactions.map(r => {
    const param = params.get(r.parameter), v = volume.get(r.compartment);
    if (!modules.has(r.owner) || !evidence.has(r.evidence) || !param || v === undefined || !r.reactants.length || !r.products.length)
      throw new Error(`Reaction ${r.id}: unresolved owner, evidence, parameter, location or participants.`);
    if (!['transfer', 'mass-action'].includes(r.kind)) throw new Error(`Reaction ${r.id}: unsupported rate law.`);
    const delta = Array(initial.length).fill(0) as number[];
    for (const [terms, sign] of [[r.reactants, -1], [r.products, 1]] as const) {
      const seen = new Set<string>();
      for (const t of terms) {
        const pool = pools.get(t.pool);
        if (!pool || seen.has(t.pool) || !Number.isInteger(t.coefficient) || t.coefficient <= 0) throw new Error(`${r.id}: invalid or duplicate reaction participant.`);
        seen.add(t.pool);
        if (owner.get(t.pool) !== r.owner) {
          const port = ports.get(t.port ?? '');
          if (!port || port.pool !== t.pool || !port.grants.includes(r.owner) || !(port.direction === 'both' || port.direction === (sign < 0 ? 'out' : 'in')))
            throw new Error(`${r.id}: unauthorized write to ${t.pool}; an appropriate port is required.`);
        }
        if (r.kind === 'mass-action' && pool.compartment !== r.compartment) throw new Error(`${r.id}: mass-action participants must share the declared effective reaction volume.`);
        delta[poolIndex.get(t.pool)!] += sign * t.coefficient;
      }
    }
    const moieties = new Set(m.species.flatMap(s => Object.keys(s.moieties)));
    for (const moiety of moieties) {
      const balance = delta.reduce((sum, n, i) => sum + n * (species.get(m.pools[i].species)!.moieties[moiety] ?? 0), 0);
      if (balance !== 0) throw new Error(`${r.id}: unbalanced ${moiety} stoichiometry.`);
    }
    if (r.kind === 'transfer' && (r.reactants.length !== 1 || r.products.length !== 1 || r.reactants[0].coefficient !== 1 || r.products[0].coefficient !== 1 || pools.get(r.reactants[0].pool)!.species !== pools.get(r.products[0].pool)!.species))
      throw new Error(`${r.id}: transfer must move one unchanged species.`);
    const order = r.reactants.reduce((s, t) => s + t.coefficient, 0);
    const k = canonical(param.value, r.kind === 'transfer' ? DIMENSIONS.firstOrder : rateDimension(order), `${r.id} rate constant`);
    stoichiometry.push(delta);
    return {kind: r.kind, k, v, terms: r.reactants.map(t => ({index: poolIndex.get(t.pool)!, coefficient: t.coefficient}))};
  });
  const signature = stableJSON(m);
  return {definition: m, signature, poolIds, initial, volumes: m.pools.map(p => volume.get(p.compartment)!), stoichiometry,
    rates: amounts => laws.map(law => law.kind === 'transfer' ? law.k * amounts[law.terms[0].index]
      : law.k * law.v * law.terms.reduce((product, t) => product * (amounts[t.index] / law.v) ** t.coefficient, 1)),
  };
}

