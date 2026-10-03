import { useEffect, useRef, useState } from 'react';
import { setAudioSettings } from '../audio/settings';
import { useAudioSettings } from '../audio/useAudio';

/** "声音" button with a small popover: music and sound-effect switches and volumes. */
export function SoundControls() {
  const s = useAudioSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const silent = !s.music && !s.sfx;
  return (
    <span className="sound" ref={ref}>
      <button
        className="btn tiny ghost"
        title="音乐与音效"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {silent ? '静音' : '声音'}
      </button>
      {open && (
        <div className="sound-pop panel">
          <Row
            label="音乐"
            on={s.music}
            volume={s.musicVolume}
            onToggle={() => setAudioSettings({ music: !s.music })}
            onVolume={(v) => setAudioSettings({ musicVolume: v, music: v > 0 })}
          />
          <Row
            label="音效"
            on={s.sfx}
            volume={s.sfxVolume}
            onToggle={() => setAudioSettings({ sfx: !s.sfx })}
            onVolume={(v) => setAudioSettings({ sfxVolume: v, sfx: v > 0 })}
          />
          <p className="muted sound-note">原创曲目与音效，全部由浏览器实时合成</p>
        </div>
      )}
    </span>
  );
}

function Row(props: {
  label: string;
  on: boolean;
  volume: number;
  onToggle: () => void;
  onVolume: (v: number) => void;
}) {
  return (
    <div className="sound-row">
      <span>{props.label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round((props.on ? props.volume : 0) * 100)}
        onChange={(e) => props.onVolume(Number(e.target.value) / 100)}
        aria-label={`${props.label}音量`}
      />
      <button className={`btn tiny ${props.on ? '' : 'ghost'}`} onClick={props.onToggle}>
        {props.on ? '开' : '关'}
      </button>
    </div>
  );
}
