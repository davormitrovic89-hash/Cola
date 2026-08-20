import './styles.css';
import { initCan } from './can/can.js';
import { initHand } from './hand/hand.js';
import { createThreeCanRenderer } from './can/renderer-three.js';

initCan({ renderer: createThreeCanRenderer() });
initHand();
