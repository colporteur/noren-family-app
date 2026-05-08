import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import DictatorOnly from './components/DictatorOnly';
import Login from './pages/Login';
import Home from './pages/Home';
import FamilyDirectory from './pages/FamilyDirectory';
import ProfilePage from './pages/ProfilePage';
import DictatorIndex from './pages/DictatorMode';
import ManageMembers from './pages/DictatorMode/ManageMembers';
import InviteGuest from './pages/DictatorMode/InviteGuest';

import NewYearsPredictions from './pages/miniapps/NewYearsPredictions';
import BoardGameSelector from './pages/miniapps/BoardGameSelector';
import BoardGameRecords from './pages/miniapps/BoardGameRecords';
import CentralLocation from './pages/miniapps/CentralLocation';
import NCAAPool from './pages/miniapps/NCAAPool';
import VirtualPlaque from './pages/miniapps/VirtualPlaque';
import VotingPortal from './pages/miniapps/VotingPortal';
import MeetingScheduler from './pages/miniapps/MeetingScheduler';
import RunningLateEarly from './pages/miniapps/RunningLateEarly';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="family" element={<FamilyDirectory />} />
        <Route path="me" element={<ProfilePage />} />

        <Route
          path="dictator"
          element={
            <DictatorOnly>
              <DictatorIndex />
            </DictatorOnly>
          }
        />
        <Route
          path="dictator/members"
          element={
            <DictatorOnly>
              <ManageMembers />
            </DictatorOnly>
          }
        />
        <Route
          path="dictator/invite"
          element={
            <DictatorOnly>
              <InviteGuest />
            </DictatorOnly>
          }
        />

        <Route path="apps/nye" element={<NewYearsPredictions />} />
        <Route path="apps/games/picker" element={<BoardGameSelector />} />
        <Route path="apps/games/records" element={<BoardGameRecords />} />
        <Route path="apps/central-location" element={<CentralLocation />} />
        <Route path="apps/ncaa" element={<NCAAPool />} />
        <Route path="apps/plaques" element={<VirtualPlaque />} />
        <Route path="apps/voting" element={<VotingPortal />} />
        <Route path="apps/meetings" element={<MeetingScheduler />} />
        <Route path="apps/late" element={<RunningLateEarly />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
