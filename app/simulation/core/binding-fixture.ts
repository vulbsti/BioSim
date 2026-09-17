import {compileModel, type ChemicalModel} from './model';
export type BindingParameters = {dosePmol: number; receptorPmol: number; clearancePerMinute: number};
export const DEFAULT_BINDING: BindingParameters = {dosePmol: 100, receptorPmol: 20, clearancePerMinute: .12};
export function bindingFixture(p: BindingParameters = DEFAULT_BINDING): ChemicalModel {
  if (!p || !Number.isFinite(p.dosePmol) || p.dosePmol < 0 || p.dosePmol > 500 || !Number.isFinite(p.receptorPmol) || p.receptorPmol < 0 || p.receptorPmol > 100 || !Number.isFinite(p.clearancePerMinute) || p.clearancePerMinute < 0 || p.clearancePerMinute > 1)
    throw new Error('Binding experiment parameters are outside their declared domain.');
  return {
    id: 'e01-ligand-binding', version: '1.0.0', description: 'Synthetic finite-pool transport, receptor binding and clearance fixture. Not calibrated insulin physiology.',
    evidence: [{id: 'e01', kind: 'synthetic', source: 'validation/p1/protocol.json#E01', species: 'abstract ligand and receptor', conditions: 'Constant effective mixing volumes; one binding site; fixed rates.', limitations: 'Synthetic engineering fixture. Conserved moieties are not an elemental chemical formula or a human parameter set.'}],
    species: [{id: 'ligand', name: 'Ligand', moieties: {ligand: 1}}, {id: 'receptor', name: 'Receptor', moieties: {receptor: 1}}, {id: 'complex', name: 'Bound receptor', moieties: {ligand: 1, receptor: 1}}],
    compartments: [
      {id: 'blood', name: 'Blood reservoir', kind: 'blood', volume: {value: 1, unit: 'L'}},
      {id: 'tissue', name: 'Local tissue bath', kind: 'interstitial', volume: {value: 200, unit: 'mL'}},
      {id: 'sink', name: 'Cumulative cleared ligand', kind: 'accounting-sink', volume: {value: 1, unit: 'L'}},
    ],
    pools: [
      {id: 'blood-ligand', species: 'ligand', compartment: 'blood', initial: {value: p.dosePmol, unit: 'pmol'}},
      {id: 'tissue-ligand', species: 'ligand', compartment: 'tissue', initial: {value: 0, unit: 'pmol'}},
      {id: 'free-receptor', species: 'receptor', compartment: 'tissue', initial: {value: p.receptorPmol, unit: 'pmol'}},
      {id: 'bound-receptor', species: 'complex', compartment: 'tissue', initial: {value: 0, unit: 'pmol'}},
      {id: 'cleared-ligand', species: 'ligand', compartment: 'sink', initial: {value: 0, unit: 'pmol'}},
    ],
    modules: [{id: 'circulation', owns: ['blood-ligand', 'cleared-ligand']}, {id: 'tissue', owns: ['tissue-ligand', 'free-receptor', 'bound-receptor']}],
    ports: [{id: 'tissue-exchange', pool: 'tissue-ligand', owner: 'tissue', grants: ['circulation'], direction: 'both'}],
    parameters: [
      {id: 'delivery', value: {value: .006, unit: '1/s'}, range: [0, 1], evidence: 'e01'},
      {id: 'return', value: {value: .03, unit: '1/s'}, range: [0, 1], evidence: 'e01'},
      {id: 'on', value: {value: 2e7, unit: 'L/(mol*s)'}, range: [0, 1e9], evidence: 'e01'},
      {id: 'off', value: {value: .003, unit: '1/s'}, range: [0, 1], evidence: 'e01'},
      {id: 'clearance', value: {value: p.clearancePerMinute, unit: '1/min'}, range: [0, 1], evidence: 'e01'},
    ],
    reactions: [
      {id: 'delivery', name: 'Delivery to tissue', owner: 'circulation', evidence: 'e01', kind: 'transfer', parameter: 'delivery', compartment: 'blood', reactants: [{pool: 'blood-ligand', coefficient: 1}], products: [{pool: 'tissue-ligand', coefficient: 1, port: 'tissue-exchange'}]},
      {id: 'return', name: 'Return to blood', owner: 'circulation', evidence: 'e01', kind: 'transfer', parameter: 'return', compartment: 'tissue', reactants: [{pool: 'tissue-ligand', coefficient: 1, port: 'tissue-exchange'}], products: [{pool: 'blood-ligand', coefficient: 1}]},
      {id: 'binding', name: 'Ligand binds receptor', owner: 'tissue', evidence: 'e01', kind: 'mass-action', parameter: 'on', compartment: 'tissue', reactants: [{pool: 'tissue-ligand', coefficient: 1}, {pool: 'free-receptor', coefficient: 1}], products: [{pool: 'bound-receptor', coefficient: 1}]},
      {id: 'unbinding', name: 'Ligand dissociates', owner: 'tissue', evidence: 'e01', kind: 'mass-action', parameter: 'off', compartment: 'tissue', reactants: [{pool: 'bound-receptor', coefficient: 1}], products: [{pool: 'tissue-ligand', coefficient: 1}, {pool: 'free-receptor', coefficient: 1}]},
      {id: 'clearance', name: 'Clearance from blood', owner: 'circulation', evidence: 'e01', kind: 'transfer', parameter: 'clearance', compartment: 'blood', reactants: [{pool: 'blood-ligand', coefficient: 1}], products: [{pool: 'cleared-ligand', coefficient: 1}]},
    ],
  };
}
export const compileBinding = (p: BindingParameters = DEFAULT_BINDING) => compileModel(bindingFixture(p));
