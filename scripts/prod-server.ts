import '../src/server/load-env';
import { createGameServer } from '../src/server/index';

const port = Number(process.env.PORT ?? 3000);
const server = createGameServer(port);
server.listen().then(() => {
  console.log(`ninja-night server listening on :${port}`);
});
