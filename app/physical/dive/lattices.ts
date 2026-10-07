import type {Lattice} from './field';

/**
 * Red cells: 7.8 µm discs cannot sit on a cubic lattice at their real count without passing through
 * each other, so they are stacked in staggered layers, 8.4 µm apart in a layer. The layer spacing
 * follows from the count. The arrangement is illustrative; the count and the size are not.
 */
export const RED_PITCH=8.4e-6;
export const redLattice=(density:number):Lattice=>({gx:RED_PITCH,gy:RED_PITCH,gz:1/(density*RED_PITCH*RED_PITCH),jitter:.06,stagger:true,salt:900});
