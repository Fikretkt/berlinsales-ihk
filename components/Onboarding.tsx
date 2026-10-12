"use client";

// Onboarding-Tutorial: 3 Bildschirme beim ersten Login.
// LocalStorage-Flag `marktsync_tutorial_seen` verhindert wiederholtes Zeigen.
// Über `forceShow`-Prop kann es manuell aus dem Menü neu gestartet werden.

import { useEffect, useState } from "react";
import { Map, ListChecks, MapPin, ArrowRight, X } from "lucide-react";

const STORAGE_KEY = "marktsync_tutorial_seen";

interface Slide {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: <Map className="h-12 w-12 text-green-600" />,
    title: "So findest du Märkte",
    body: "Oben siehst du alle Märkte auf einer Karte. Tipp auf Liste, wenn du lieber blätterst oder über Name, Straße oder PLZ suchst. Filter zeigen dir nur die Märkte, die du gerade brauchst (z. B. nur freie).",
  },
  {
    icon: <ListChecks className="h-12 w-12 text-blue-600" />,
    title: "So erkennst du den Status",
    body: "Jeder Markt hat eine Farbe: Grün heißt frei, Gelb heißt deine Lieferung wird erwartet, Orange heißt Kontrolle nötig, Rosa heißt persönliches Gespräch nötig, Rot heißt gesperrt. Im Markt-Detail steht immer in Klartext, was zu tun ist.",
  },
  {
    icon: <MapPin className="h-12 w-12 text-pink-500" />,
    title: "So zeigst du anderen, dass du da warst",
    body: "Tipp einen Markt an, dann auf „Ich bin im Markt“. Wähl das Ergebnis (Erfolg, niemand da, Gespräch nötig …). Andere sehen die Änderung sofort. Hast du dich vertippt? In den nächsten 30 Sekunden kannst du es rückgängig machen.",
  },
];

export function Onboarding({
  initialOpen,
  onClose,
}: {
  initialOpen: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (initialOpen) setStep(0);
  }, [initialOpen]);

  if (!initialOpen) return null;

  function finish() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore (private mode etc.)
    }
    onClose();
  }

  const slide = SLIDES[step]!;
  const isLast = step === SLIDES.length - 1;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex justify-end">
          <button
            onClick={finish}
            aria-label="Schließen"
            className="min-h-10 min-w-10 rounded-full p-2 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col items-center text-center">
          {slide.icon}
          <h2 id="tutorial-title" className="mt-4 text-xl font-semibold text-gray-900">
            {slide.title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-gray-700">{slide.body}</p>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full ${i === step ? "bg-green-600" : "bg-gray-300"}`}
              aria-hidden
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="min-h-12 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700"
            >
              Zurück
            </button>
          ) : (
            <span />
          )}
          {isLast ? (
            <button
              onClick={finish}
              className="flex min-h-12 items-center gap-2 rounded-lg bg-green-600 px-5 text-base font-semibold text-white hover:bg-green-700"
            >
              Los geht&apos;s
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex min-h-12 items-center gap-2 rounded-lg bg-green-600 px-5 text-base font-semibold text-white hover:bg-green-700"
            >
              Weiter <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Auto-Trigger-Wrapper: prüft localStorage und öffnet, falls noch nicht gesehen.
export function OnboardingAutoTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) setOpen(true);
    } catch {
      // ignore
    }
  }, []);

  return <Onboarding initialOpen={open} onClose={() => setOpen(false)} />;
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
