import React from "react";
import { Image, StyleProp, ImageStyle } from "react-native";

/**
 * I due marchi EasyGame in bianco — gli stessi file di
 * `design-source/assets/` (`logo-white.png`, la scritta; `icon-white.png`,
 * la "e"), copiati in `assets/images/brand/` perche i due alberi npm non si
 * importano (CLAUDE.md §6). Sul cielo blu il marchio e sempre nella
 * versione bianca; la versione blu non serve a nessuna schermata mobile.
 *
 * Due soli trattamenti ammessi dal design v3 (artboard 5, "Mark usage"):
 * la scritta piatta accanto al passo della schermata, e il watermark della
 * "e" (`BrandStateLayout`). Mai la "e" dentro un riquadro a gradiente.
 */
const WORDMARK = require("../../../assets/images/brand/logo-white.png");
const MARK = require("../../../assets/images/brand/icon-white.png");

/** Proporzione del file `logo-white.png` (1000×200). */
const WORDMARK_RATIO = 5;

interface WordmarkProps {
  /** Altezza in punti; la larghezza segue la proporzione del file. */
  height?: number;
  opacity?: number;
  style?: StyleProp<ImageStyle>;
}

export function Wordmark({
  height = 15,
  opacity = 0.96,
  style,
}: WordmarkProps) {
  return (
    <Image
      source={WORDMARK}
      accessibilityLabel="EasyGame"
      resizeMode="contain"
      style={[{ height, width: height * WORDMARK_RATIO, opacity }, style]}
    />
  );
}

interface BrandMarkProps {
  size?: number;
  opacity?: number;
  style?: StyleProp<ImageStyle>;
}

/** La "e" del marchio, non incorniciata. */
export function BrandMark({ size = 24, opacity = 1, style }: BrandMarkProps) {
  return (
    <Image
      source={MARK}
      accessibilityLabel=""
      accessibilityElementsHidden
      resizeMode="contain"
      style={[{ width: size, height: size, opacity }, style]}
    />
  );
}
