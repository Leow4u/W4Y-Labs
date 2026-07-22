import { Navigate, Route, Routes } from "react-router-dom";
import MockupsIndex from "./MockupsIndex";
import ChatHeroMock from "./screens/ChatHeroMock";
import ChatSessionMock from "./screens/ChatSessionMock";
import EntregasMock from "./screens/EntregasMock";
import IntegracoesMock from "./screens/IntegracoesMock";
import AgentesMock from "./screens/AgentesMock";
import AgendaMock from "./screens/AgendaMock";
import ConfigMock from "./screens/ConfigMock";

/** Isolated mock gallery — bypasses main App shell when mounted at /mockups/*. */
export default function MockupsRouter() {
  return (
    <Routes>
      <Route path="/mockups/v1" element={<MockupsIndex />} />
      <Route path="/mockups/v1/chat-hero" element={<ChatHeroMock />} />
      <Route path="/mockups/v1/chat-session" element={<ChatSessionMock />} />
      <Route path="/mockups/v1/entregas" element={<EntregasMock />} />
      <Route path="/mockups/v1/integracoes" element={<IntegracoesMock />} />
      <Route path="/mockups/v1/agentes" element={<AgentesMock />} />
      <Route path="/mockups/v1/agentes/*" element={<AgentesMock />} />
      <Route path="/mockups/v1/agenda" element={<AgendaMock />} />
      <Route path="/mockups/v1/config" element={<ConfigMock />} />
      <Route path="/mockups" element={<Navigate to="/mockups/v1" replace />} />
      <Route path="/mockups/*" element={<Navigate to="/mockups/v1" replace />} />
    </Routes>
  );
}
