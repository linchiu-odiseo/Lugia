import { describe, it, expect } from 'vitest';
import {
  INSPIRATIONAL_QUOTES,
  randomQuote,
} from '../../../../../src/LR_render/pages/home/inspirational-quotes';

// Módulo puro TS (sin Angular DI), por eso vive en tests/unit/ y no en
// tests/feature/. La rotación de frases en /home es una capa ambient
// estática — lo único que el invariante exige es que el array tenga al
// menos una entrada y que randomQuote() siempre devuelva una de esas.
describe('inspirational-quotes', () => {
  it('INSPIRATIONAL_QUOTES contiene al menos una frase', () => {
    expect(INSPIRATIONAL_QUOTES.length).toBeGreaterThan(0);
  });

  it('randomQuote() devuelve siempre una entrada del set', () => {
    // Muestreamos varias veces para cubrir caminos del Math.random sin
    // depender del determinismo del generador. Cualquier valor devuelto
    // debe estar contenido en el set source de verdad.
    for (let i = 0; i < 50; i++) {
      const quote = randomQuote();
      expect(INSPIRATIONAL_QUOTES).toContain(quote);
    }
  });
});
