import {createRoot} from 'react-dom/client';
import Simulator from '../app/simulation/Simulator';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<Simulator/>);
