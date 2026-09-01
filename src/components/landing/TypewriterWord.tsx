"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const TYPE_MS = 85;
const DELETE_MS = 45;
const HOLD_MS = 1600;
const SWAP_PAUSE_MS = 300;

function articleFor(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

export function TypewriterWord({ words, className }: { words: string[]; className?: string }) {
  const [wordIndex, setWordIndex] = useState(0);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"typing" | "holding" | "deleting" | "paused">("typing");
  const reducedMotion = useReducedMotion();
  const measureRef = useRef<HTMLSpanElement>(null);
  const [minWidth, setMinWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!measureRef.current) return;
    const widths = Array.from(measureRef.current.children).map((el) => (el as HTMLElement).offsetWidth);
    setMinWidth(Math.max(...widths, 0));
  }, [words]);

  useEffect(() => {
    if (reducedMotion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(words[0] ?? "");
      return;
    }
    const word = words[wordIndex % words.length] ?? "";
    let timer: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (text.length < word.length) {
        timer = setTimeout(() => setText(word.slice(0, text.length + 1)), TYPE_MS);
      } else {
        timer = setTimeout(() => setPhase("holding"), HOLD_MS);
      }
    } else if (phase === "holding") {
      timer = setTimeout(() => setPhase("deleting"), 0);
    } else if (phase === "deleting") {
      if (text.length > 0) {
        timer = setTimeout(() => setText(text.slice(0, -1)), DELETE_MS);
      } else {
        timer = setTimeout(() => setPhase("paused"), SWAP_PAUSE_MS);
      }
    } else {
      timer = setTimeout(() => {
        setWordIndex((i) => (i + 1) % words.length);
        setPhase("typing");
      }, 0);
    }
    return () => clearTimeout(timer);
  }, [phase, text, wordIndex, words, reducedMotion]);

  const currentWord = words[wordIndex % words.length] ?? "";

  return (
    <span className="whitespace-nowrap">
      {articleFor(currentWord)}{" "}
      <span className={cn("relative inline-block", className)} style={{ minWidth }}>
        {text || " "}
        <span aria-hidden className="ml-0.5 inline-block w-[2px] animate-pulse bg-current align-[-0.1em]" style={{ height: "0.85em" }} />
        {                                                                                           }
        <span ref={measureRef} className="pointer-events-none absolute left-0 top-0 -z-10 opacity-0" aria-hidden>
          {words.map((word) => (
            <span key={word} className="whitespace-nowrap">
              {word}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
