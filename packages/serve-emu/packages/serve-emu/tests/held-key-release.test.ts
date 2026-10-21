import { expect, test } from "bun:test";
import { ClientTouchState } from "../src/client-touch-state.ts";
import { ControlInputQueue, ControlInputRejectedError } from "../src/control-input-queue.ts";
import type { Gesture } from "../src/input.ts";

type Key = Extract<Gesture, { type: "key" }>;
const screen = { width: 576, height: 1280 };
const key = (keycode: number, action?: Key["action"]): Key =>
  action ? { type: "key", keycode, action } : { type: "key", keycode };

function harness() {
  const sent: Key[] = [];
  let rejectNext = false;
  const queue = new ControlInputQueue({
    maxDepth: 16,
    dispatcher: {
      async dispatchGesture(gesture) {
        if (gesture.type !== "key") return;
        if (rejectNext) {
          rejectNext = false;
          throw new ControlInputRejectedError("rejected key");
        }
        sent.push(gesture);
      },
      async resetVideo() {},
    },
  });
  const target = {
    identity: queue,
    pointerNamespace: queue,
    enqueue: (gesture: Gesture) => queue.enqueue(gesture, screen),
  };
  return {
    queue,
    sent,
    owner: () => new ClientTouchState(() => target),
    rejectNext() {
      rejectNext = true;
    },
  };
}

test("close releases a key that the socket still holds", async () => {
  const h = harness();
  const owner = h.owner();
  try {
    await owner.enqueue(key(26, "down")).completion;
    await owner.close();
    expect(h.sent).toEqual([key(26, "down"), key(26, "up")]);
  } finally {
    h.queue.close();
  }
});

test("close sends nothing for a key that was released or pressed", async () => {
  const h = harness();
  const owner = h.owner();
  try {
    await owner.enqueue(key(24, "down")).completion;
    await owner.enqueue(key(24, "up")).completion;
    await owner.enqueue(key(25)).completion;
    await owner.close();
    expect(h.sent).toEqual([key(24, "down"), key(24, "up"), key(25)]);
  } finally {
    h.queue.close();
  }
});

test("close sends no UP for a key whose DOWN was rejected", async () => {
  const h = harness();
  const owner = h.owner();
  try {
    h.rejectNext();
    await expect(owner.enqueue(key(26, "down")).completion).rejects.toBeInstanceOf(
      ControlInputRejectedError,
    );
    await owner.close();
    expect(h.sent).toEqual([]);
  } finally {
    h.queue.close();
  }
});

test("close during a DOWN that is then rejected does not fail", async () => {
  const h = harness();
  const owner = h.owner();
  try {
    h.rejectNext();
    const down = owner.enqueue(key(26, "down")).completion.catch(() => {});
    await expect(owner.close()).resolves.toBeUndefined();
    await down;
  } finally {
    h.queue.close();
  }
});
