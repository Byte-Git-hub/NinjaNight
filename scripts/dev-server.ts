import '../src/server/load-env.ts';
import { createGameServer } from '../src/server/index.ts';

const port = Number(process.env.PORT ?? 3000);
const server = createGameServer(port);
server.listen().then(() => {
  console.log(`ninja-night server listening on :${port}`);
});
