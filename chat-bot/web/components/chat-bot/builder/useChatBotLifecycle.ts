import { useRef, useState } from "react";
import { chatBotApi, type PublishWarning } from "../../../api/chatBotApi";
import { ApiError, errorMessage } from "../../../api/http";
import type { ChatBot, ChatBotUpdate, PublishedChatBot } from "../../../api/types";
import { defaultPublicId } from "./state/createId";
import type { BuilderStore } from "./state/builderStore";

export type BusyAction = "saving" | "publishing" | "unpublishing";

/** What the builder saves through PATCH /api/v1/typebots/{id}. */
const toUpdate = (chatBot: ChatBot): ChatBotUpdate => ({
  name: chatBot.name,
  groups: chatBot.groups,
  events: chatBot.events,
  edges: chatBot.edges,
  variables: chatBot.variables,
  theme: chatBot.theme,
  settings: chatBot.settings,
  publicId: chatBot.publicId,
  // Lets the backend detect that someone else saved a newer version meanwhile.
  updatedAt: chatBot.updatedAt,
});

/**
 * Save / publish / unpublish. Saving is manual (explicit Save button or Ctrl+S).
 * Published state always comes from GET …/publishedTypebot after a change.
 */
export const useChatBotLifecycle = (store: BuilderStore, initialPublished: PublishedChatBot | null) => {
  const [published, setPublished] = useState(initialPublished);
  const [busy, setBusy] = useState<BusyAction>();
  const [error, setError] = useState<string>();
  const [warnings, setWarnings] = useState<PublishWarning[]>([]);
  const [hasConflict, setHasConflict] = useState(false);
  const isBusy = useRef(false);

  /** Runs one action at a time; returns false when it failed or another action is running. */
  const run = async (action: BusyAction, task: () => Promise<void>) => {
    if (isBusy.current) return false;
    isBusy.current = true;
    setBusy(action);
    setError(undefined);
    try {
      await task();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setHasConflict(true);
      else setError(errorMessage(err));
      return false;
    } finally {
      isBusy.current = false;
      setBusy(undefined);
    }
  };

  const saveNow = async ({ overwrite = false } = {}) => {
    const { chatBot, revision, savedRevision } = store.getState();
    if (revision === savedRevision && !overwrite) return;
    const saved = await chatBotApi.updateChatBot(chatBot.id, toUpdate(chatBot), { overwrite });
    store.dispatch({ type: "saved", revision, updatedAt: saved.updatedAt, publicId: saved.publicId });
    if (overwrite) setHasConflict(false);
  };

  const refreshPublished = async () => setPublished(await chatBotApi.getPublishedChatBot(store.getState().chatBot.id));

  return {
    published,
    busy,
    error,
    warnings,
    hasConflict,
    dismissError: () => setError(undefined),
    dismissWarnings: () => setWarnings([]),
    cancelConflict: () => setHasConflict(false),

    save: () => run("saving", () => saveNow()),

    overwrite: () => run("saving", () => saveNow({ overwrite: true })),

    publish: () =>
      run("publishing", async () => {
        const { chatBot } = store.getState();
        if (!chatBot.publicId) store.dispatch({ type: "setPublicId", publicId: defaultPublicId(chatBot.name, chatBot.id) });
        await saveNow();
        setWarnings(await chatBotApi.publishChatBot(chatBot.id));
        await refreshPublished();
      }),

    unpublish: () =>
      run("unpublishing", async () => {
        await chatBotApi.unpublishChatBot(store.getState().chatBot.id);
        await refreshPublished();
      }),
  };
};

export type ChatBotLifecycle = ReturnType<typeof useChatBotLifecycle>;
