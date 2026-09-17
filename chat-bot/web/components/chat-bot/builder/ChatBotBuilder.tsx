import { useEffect, useRef, useState } from "react";
import type { ChatBot, PublishedChatBot } from "../../../api/types";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { Dialog } from "../shared/Dialog";
import { BlockPalette } from "./BlockPalette";
import { BuilderToolbar } from "./BuilderToolbar";
import { BuilderCanvas } from "./canvas/BuilderCanvas";
import { Inspector } from "./inspector/Inspector";
import { BuilderStoreProvider, createBuilderStore, useBuilder } from "./state/builderStore";
import { TestPanel } from "./TestPanel";
import { useChatBotLifecycle } from "./useChatBotLifecycle";
import { WebChatDesigner } from "./webChat/WebChatDesigner";
import "./builder.css";

type Props = { chatBot: ChatBot; published: PublishedChatBot | null };

/**
 * Builder layout:  Toolbar
 *                  Palette | Canvas | Inspector (or Test panel)
 * All chat bot edits go through the builder store; this component only wires panels together.
 */
export const ChatBotBuilder = ({ chatBot, published }: Props) => {
  const [store] = useState(() => createBuilderStore(chatBot));
  const lifecycle = useChatBotLifecycle(store, published);
  const [isTestOpen, setIsTestOpen] = useState(false);
  const [isWebChatOpen, setIsWebChatOpen] = useState(false);

  useKeyboardShortcuts(store, lifecycle.save);
  useUnsavedChangesWarning(store);
  const connectionError = useConnectedAccountFromUrl(store);

  return (
    <BuilderStoreProvider store={store}>
      <div className="builder">
        <BuilderToolbar lifecycle={lifecycle} onTest={() => {
            // The test is shown right away (an open editor would cover it).
            store.dispatch({ type: "select", selection: undefined });
            setIsTestOpen(true);
          }} onWebChat={() => setIsWebChatOpen(true)} />
        {connectionError && (
          <div className="alert builder__alert" role="alert">
            Account not connected: {connectionError}
          </div>
        )}
        {lifecycle.error && (
          <div className="alert builder__alert" role="alert">
            {lifecycle.error}
            <button type="button" className="btn btn--ghost btn--sm" onClick={lifecycle.dismissError}>
              Dismiss
            </button>
          </div>
        )}
        <div className="builder__body">
          <BlockPalette />
          <BuilderCanvas />
          <SidePanel isTestOpen={isTestOpen} onCloseTest={() => setIsTestOpen(false)} />
        </div>
      </div>

      {isWebChatOpen && <WebChatDesigner lifecycle={lifecycle} onClose={() => setIsWebChatOpen(false)} />}

      {lifecycle.hasConflict && (
        <ConfirmDialog
          title="Newer version found"
          message="This chat bot was saved somewhere else after you opened it. Overwrite it with your version?"
          confirmLabel="Overwrite"
          isDestructive
          onConfirm={async () => {
            await lifecycle.overwrite();
          }}
          onClose={lifecycle.cancelConflict}
        />
      )}

      {lifecycle.warnings.length > 0 && (
        <Dialog title="Published with warnings" onClose={lifecycle.dismissWarnings}>
          <ul>
            {lifecycle.warnings.map((warning) => (
              <li key={warning.trademark}>Possible trademark infringement: {warning.trademark}</li>
            ))}
          </ul>
        </Dialog>
      )}
    </BuilderStoreProvider>
  );
};

/**
 * Right panel: the Test chat while testing, the editor of the selected item otherwise.
 * Selecting something during a test opens its editor and keeps the conversation (hidden);
 * closing the editor brings the test back.
 */
const SidePanel = ({ isTestOpen, onCloseTest }: { isTestOpen: boolean; onCloseTest: () => void }) => {
  const hasSelection = useBuilder((state) => state.selection !== undefined);
  if (!isTestOpen) return <Inspector />;
  return (
    <>
      {hasSelection && <Inspector />}
      <div className="builder__test-slot" hidden={hasSelection}>
        <TestPanel onClose={onCloseTest} />
      </div>
    </>
  );
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** Ctrl/⌘+S saves; Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z or Ctrl+Y redoes; Delete/Backspace removes the selection. */
const useKeyboardShortcuts = (store: ReturnType<typeof createBuilderStore>, save: () => void) => {
  // Latest save function without re-registering the listener on every render.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current();
        return;
      }
      const key = event.key.toLowerCase();
      // Inside text fields the browser's own undo applies.
      if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y") && !isTyping(event.target) && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        store.dispatch({ type: key === "y" || event.shiftKey ? "redo" : "undo" });
        return;
      }
      if ((event.key !== "Delete" && event.key !== "Backspace") || isTyping(event.target) || document.querySelector("dialog[open]")) return;
      const { selection } = store.getState();
      if (selection?.kind === "block") store.dispatch({ type: "deleteBlock", blockId: selection.blockId });
      else if (selection?.kind === "group") store.dispatch({ type: "deleteGroup", groupId: selection.groupId });
      else if (selection?.kind === "edge") store.dispatch({ type: "deleteEdge", edgeId: selection.edgeId });
      else if (selection?.kind === "event") store.dispatch({ type: "deleteEvent", eventId: selection.eventId });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);
};

/**
 * Coming back from Google sign-in: /chat-bots/:id?blockId=…&credentialsId=… selects the block
 * and uses the new account (the change still has to be saved), or shows the error.
 */
const useConnectedAccountFromUrl = (store: ReturnType<typeof createBuilderStore>) => {
  const [error] = useState(() => new URLSearchParams(window.location.search).get("credentialsError") ?? undefined);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const blockId = params.get("blockId");
    const credentialsId = params.get("credentialsId");
    if (!blockId) return;
    window.history.replaceState(null, "", window.location.pathname);
    const { chatBot } = store.getState();
    const group = chatBot.groups.find((g) => g.blocks.some((b) => b.id === blockId));
    const block = group?.blocks.find((b) => b.id === blockId);
    if (!group || !block) return;
    if (credentialsId) store.dispatch({ type: "updateBlock", block: { ...block, options: { ...block.options, credentialsId } } });
    store.dispatch({ type: "select", selection: { kind: "block", groupId: group.id, blockId } });
  }, [store]);
  return error;
};

const useUnsavedChangesWarning = (store: ReturnType<typeof createBuilderStore>) => {
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const { revision, savedRevision } = store.getState();
      if (revision !== savedRevision) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [store]);
};
