/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Resources from './pages/Resources';
import Waitlist from './pages/Waitlist';
import Mission from './pages/Mission';
import Assessment from './pages/Assessment';
import Results from './pages/Results';
import Staff from './pages/Staff';

export default function App() {
  return (
    <Routes>
      {/* Standalone Route for Assessment as it has a different layout */}
      <Route path="/assessment" element={<Assessment />} />
      <Route path="/staff" element={<Layout />} >
         <Route index element={<Staff />} />
      </Route>
      
      {/* Routes within the main layout */}
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="resources" element={<Resources />} />
        <Route path="waitlist" element={<Waitlist />} />
        <Route path="mission" element={<Mission />} />
        <Route path="results" element={<Results />} />
      </Route>
    </Routes>
  );
}
