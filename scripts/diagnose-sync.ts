import { createGameServer } from '../src/server/index';
import { io as ioc, type Socket } from 'socket.io-client';
import { EV, OUT } from '../src/shared/protocol';

const PORT = 3599;

async function waitEvent<T>(socket: Socket, event: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

async function runDiagnosis() {
  console.log('=== Starting Diagnosis Script for Stage 6E ===');
  const server = createGameServer(PORT);
  await server.listen();

  const base = `http://127.0.0.1:${PORT}`;
  const host = ioc(base, { transports: ['websocket'] });
  await waitEvent(host, 'connect');

  let latestView: any = null;
  const snapshots: Array<{ seq: number; phase: string; step: string; windowId: string; pending: string | null; eventsLen: number }> = [];

  host.on(OUT.viewSnapshot, (v: any) => {
    latestView = v;
    snapshots.push({
      seq: snapshots.length + 1,
      phase: v.phase,
      step: v.step,
      windowId: v.windowId,
      pending: v.pendingDecision?.kind ?? null,
      eventsLen: v.publicEvents?.length ?? 0,
    });
    console.log(`[CLIENT RECEIVED VIEW #${snapshots.length}] phase=${v.phase} step=${v.step} pending=${v.pendingDecision?.kind ?? 'none'} events=${v.publicEvents?.length ?? 0}`);
  });

  host.on(OUT.eventPublic, (evs: any[]) => {
    console.log(`[CLIENT RECEIVED PUBLIC EVENTS] count=${evs.length} types=${evs.map(e => e.type).join(', ')}`);
  });

  host.emit(EV.roomCreate, { nickname: 'Host' });
  const ack = await waitEvent<{ roomCode: string; seatToken: string }>(host, OUT.roomAck);
  const room = server.rooms.get(ack.roomCode)!;

  // 添加 3 个 Bot
  for (let i = 0; i < 3; i++) {
    host.emit(EV.roomAddBot, { seatToken: ack.seatToken });
    await new Promise((r) => setTimeout(r, 60));
  }
  console.log(`Room created with ${room.lobby.length} seats (${room.bots.size} bots)`);

  // 开始游戏
  host.emit(EV.roomStart, { seatToken: ack.seatToken });
  await new Promise((r) => setTimeout(r, 300));

  console.log(`\nGame started. Server state phase: ${room.state?.phase}`);

  // 推进对局并观察同步
  let iterations = 0;
  while (iterations < 25 && room.state && !room.state.gameOver) {
    iterations++;
    await new Promise((r) => setTimeout(r, 600));

    // 如果 Host 有 pending 待办
    if (latestView?.pendingDecision) {
      const p = latestView.pendingDecision;
      console.log(`\n>>> Host acting on pending: kind=${p.kind}, options=${JSON.stringify(p.options)}`);

      if (p.kind === 'draftPick' || p.kind === 'draftDiscard') {
        host.emit(EV.commandSend, {
          commandId: `cmd-${Date.now()}-${Math.random()}`,
          seatToken: ack.seatToken,
          windowId: latestView.windowId,
          type: p.kind === 'draftPick' ? 'draft.pick' : 'draft.discard',
          payload: { cardInstanceId: p.options[0] },
        });
      } else if (p.kind === 'declareCards') {
        host.emit(EV.commandSend, {
          commandId: `cmd-${Date.now()}-${Math.random()}`,
          seatToken: ack.seatToken,
          windowId: latestView.windowId,
          type: 'night.passPhase',
          payload: {},
        });
      } else if (p.kind === 'chooseTarget') {
        host.emit(EV.commandSend, {
          commandId: `cmd-${Date.now()}-${Math.random()}`,
          seatToken: ack.seatToken,
          windowId: latestView.windowId,
          type: 'night.chooseTarget',
          payload: { targetSeatId: p.options[0] },
        });
      } else {
        host.emit(EV.commandSend, {
          commandId: `cmd-${Date.now()}-${Math.random()}`,
          seatToken: ack.seatToken,
          windowId: latestView.windowId,
          type: 'night.chooseOptional',
          payload: { choose: false },
        });
      }
    } else {
      console.log(`Host has NO pending. Waiting... (Server state phase=${room.state?.phase}, step=${room.state?.step}, pendingSeats=${room.state?.pending.map(x => x.seatId).join(',')})`);
    }
  }

  console.log(`\n=== Diagnosis Summary ===`);
  console.log(`Server final state: phase=${room.state?.phase}, gameOver=${room.state?.gameOver}`);
  console.log(`Total snapshots sent to client: ${snapshots.length}`);
  const lastSnap = snapshots[snapshots.length - 1];
  console.log(`Client last snapshot: phase=${lastSnap?.phase}, pending=${lastSnap?.pending}`);
  console.log(`Phase match: Server (${room.state?.phase}) vs Client (${lastSnap?.phase})`);

  host.disconnect();
  await server.close();
}

runDiagnosis().catch((err) => {
  console.error('Diagnosis failed:', err);
  process.exit(1);
});
