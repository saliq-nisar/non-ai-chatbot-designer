import { lazy, Suspense } from "react";
import { Spinner } from "./components/chat-bot/shared/Spinner";
import { useRoute } from "./router";

// Each page is its own chunk: the embedded chat never downloads the builder.
const ChatBotListPage = lazy(() => import("./pages/ChatBotListPage"));
const ChatBotBuilderPage = lazy(() => import("./pages/ChatBotBuilderPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));

export const App = () => {
  const route = useRoute();
  return (
    <Suspense fallback={<div className="center"><Spinner /></div>}>
      {route.page === "list" && <ChatBotListPage />}
      {route.page === "builder" && <ChatBotBuilderPage key={route.chatBotId} chatBotId={route.chatBotId} />}
      {route.page === "chat" && <ChatPage key={route.publicId} publicId={route.publicId} />}
      {route.page === "login" && <LoginPage />}
      {route.page === "notFound" && <div className="center">Page not found</div>}
    </Suspense>
  );
};
