import { config } from "../config.js";
import { parseDurationSeconds, signJwt } from "../jwt.js";

/**
 * Live agent: an external Socket.IO server can push agent messages into an open
 * Web Chat. startChat returns a token scoped to the conversation's room
 * (`room:{resultId}_web`), signed with WIDGET_JWT_SECRET (shared with that server),
 * plus the server host. Disabled when WIDGET_JWT_SECRET is not set.
 */
const expiresInSeconds = parseDurationSeconds(config.liveAgent.jwtExpiresIn);

export const createLiveAgentConnection = (resultId: string) => {
  if (!config.liveAgent.jwtSecret) return {};
  return {
    widgetSocketToken: signJwt({ sessionRoomId: resultId, platform: "web", role: "widget" }, config.liveAgent.jwtSecret, expiresInSeconds),
    liveAgentSocketHost: config.liveAgent.socketHost,
  };
};
