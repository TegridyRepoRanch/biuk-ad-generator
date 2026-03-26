import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import path from "path"
import fs from "fs"
import React from "react"
import { buildAdOverlaySvg } from "./overlay"

let fontBuffer: ArrayBuffer | null = null

function loadFont(): ArrayBuffer {
  if (fontBuffer) return fontBuffer
  const fontPath = path.join(process.cwd(), "src", "fonts", "Inter-Bold.ttf")
  if (fs.existsSync(fontPath)) {
    const buf = fs.readFileSync(fontPath)
    fontBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    return fontBuffer
  }
  throw new Error("Inter-Bold.ttf not found")
}

export async function renderOverlayPng(
  width: number,
  height: number,
  headline: string,
  subhead: string | null | undefined,
  callouts: Array<{ text: string; position: { x: number; y: number } }>,
  bannerColor: string,
  bannerText: string
): Promise<{ buffer: Buffer; logs: string[] }> {
  const logs: string[] = []
  try {
    const font = loadFont()
    logs.push(`Font loaded, size: ${font.byteLength}`)

    const overlayElement = buildAdOverlaySvg(width, height, headline, subhead, callouts, bannerColor, bannerText);
    logs.push(`Overlay element created.`)

    const svg = await satori(overlayElement, {
      width,
      height,
      fonts: [
        { name: "Inter", data: font, weight: 700, style: "normal" as const },
        { name: "Inter", data: font, weight: 400, style: "normal" as const }
      ],
    })
    logs.push(`SVG generated, length: ${svg.length} bytes`)

    const resvg = new Resvg(svg, {
      fitTo: { mode: "width" as const, value: width },
      background: "rgba(0,0,0,0)",
    })
    logs.push(`Resvg instance created.`)
    
    const rendered = resvg.render()
    const pngBuffer = Buffer.from(rendered.asPng())
    logs.push(`PNG rendered, size: ${pngBuffer.length} bytes`)
    
    return { buffer: pngBuffer, logs }
  } catch (error: any) {
    logs.push(`ERROR in renderOverlayPng: ${error.message}`)
    return { buffer: Buffer.from(""), logs }
  }
}

// Keeping the old text renderer for now in case we need it, but it's unused.
export async function renderTextPng() {
  return { buffer: Buffer.from(""), width: 0, height: 0 }
}
