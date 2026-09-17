/**
 * 6G-1 语音底部控制区与横幅（纯字符串渲染，由 AppUI 拼装与绑定）。
 * 新增选择器：#voice-bar / #btn-voice-join / #btn-voice-mute /
 * #btn-voice-listen / #voice-banner（不改动已有 e2e 选择器）。
 */
import type { VoiceClientStatus } from './client';
import { micIcon } from './icons';

export interface VoiceBarState {
  status: VoiceClientStatus;
  muted: boolean;
  listening: boolean;
  supported: boolean;
}

/** 底部语音条：加入/开麦/听三键（未在房间时由调用方隐藏） */
export function voiceBarHtml(s: VoiceBarState): string {
  const joinLabel =
    s.status === 'active' ? '离开语音' : s.status === 'joining' ? '加入中…' : '加入语音';
  const muteLabel = s.muted ? `${micIcon('closed')} 闭麦中` : `${micIcon('open')} 开麦中`;
  const listenLabel = s.listening ? '听语音：开' : '听语音：关';
  const inVoice = s.status === 'active';
  return `<div class="voice-bar" id="voice-bar" role="group" aria-label="语音连麦">
    <button id="btn-voice-join" type="button" class="voice-btn" ${s.status === 'joining' ? 'disabled' : ''}>${joinLabel}</button>
    <button id="btn-voice-mute" type="button" class="voice-btn" ${inVoice ? '' : 'disabled'}>${muteLabel}</button>
    <button id="btn-voice-listen" type="button" class="voice-btn" aria-pressed="${s.listening ? 'true' : 'false'}">${listenLabel}</button>
  </div>`;
}

/** 降级横幅：无 WebRTC / 拒麦 / SFU 不可达时显示，不阻塞游戏 */
export function voiceBannerHtml(msg: string): string {
  if (!msg) return '';
  return `<div class="banner warn voice-banner" id="voice-banner">${escapeVoice(msg)}</div>`;
}

function escapeVoice(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
