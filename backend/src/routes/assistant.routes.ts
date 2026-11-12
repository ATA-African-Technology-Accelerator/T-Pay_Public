import express, { Router, type RequestHandler } from 'express';
import type { AssistantController } from '../controllers/AssistantController';
import { ASSISTANT_BODY_LIMIT } from '../validation/schemas';




// Recorded speech is larger than any other request, so only this route accepts a bigger body.
export const assistantBodyParser = express.json({ limit: ASSISTANT_BODY_LIMIT });


export function createAssistantRouter(assistant: AssistantController, authenticate: RequestHandler): Router {
  const router = Router();

  router.post('/assistant/interpret', authenticate, assistant.interpret);
  router.post('/assistant/speak', authenticate, assistant.speak);

  return router;
}
