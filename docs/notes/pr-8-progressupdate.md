# PR 8 progress note: tissue uptake zoom

Written 2026-10-08. Step 5 of the list (marked meal, scrub back in time, pumping heart, meal route, tissue uptake zoom, contraction and reflex). Steps 1 to 4 are merged.

## Decisions

- The zoom reuses the existing fascicle specimen and its manifest layout (fibre and capillary centres) instead of a new scene, and is reached from the meal route's last station.
- The body run now reaches the tissue explorer in every mode. The older `bodyRun` link, which needs the experimental pathway, is unchanged.
- Dots are drawn over the specimen. The capillaries run between the fibres, so depth-tested dots were invisible from every angle.
- Entered from the route, the fascicle opens end-on, where crossings from capillary to fibre read as radial movement.
- The dot scale is computed and shown, because a dot count with no stated scale would look like data it is not.

## Tried

- The readout first sat at the bottom left and overlapped the scale bar; it moved under the caption.

## Not done

- Endothelial and interstitial steps, GLUT4 at the membrane, and the dive's true-size molecules inside tissue.
- A per-fascicle or per-muscle rate; the model has one muscle compartment.
- Step 6: contraction and the knee-jerk reflex.
