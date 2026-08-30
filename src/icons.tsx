import type { ComponentType, ImgHTMLAttributes } from "react";
import {
  ArrowSquareOut, CaretDown, Copy, DownloadSimple, FloppyDisk, GearSix, PencilSimple, Play, Plus, Trash, type IconProps,
} from "@phosphor-icons/react";

export type PixelIconName =
  | "select" | "image" | "text" | "task" | "template"
  | "prompt" | "product" | "reference" | "api" | "memory"
  | "templateTask" | "imageContainer"
  | "copy" | "open" | "trash" | "play" | "save" | "plus" | "edit" | "download" | "settings" | "caretDown";

const artwork: Partial<Record<PixelIconName, string>> = {
  select: "select.png", image: "image.png", text: "text.png", task: "task.png",
  template: "template.png", templateTask: "template-task.png", imageContainer: "image-container.png", prompt: "prompt.png",
  product: "product.png", reference: "reference.png", api: "api.png", memory: "memory.png",
};

const utilities: Partial<Record<PixelIconName, ComponentType<IconProps>>> = {
  copy: Copy, open: ArrowSquareOut, trash: Trash, play: Play,
  save: FloppyDisk, plus: Plus, edit: PencilSimple, download: DownloadSimple, settings: GearSix, caretDown: CaretDown,
};

export function PixelIcon({name, className = "", ...props}: {name: PixelIconName} & IconProps) {
  const file = artwork[name];
  if (file) return <img src={`icons/${file}`} alt="" aria-hidden="true" className={`pf-art-icon ${className}`.trim()} {...props as ImgHTMLAttributes<HTMLImageElement>}/>;
  const Icon = utilities[name]!;
  return <Icon weight="bold" className={`pf-utility-icon ${className}`.trim()} {...props}/>;
}

export function PixelFlowMark(props: IconProps) {
  return <img src="icons/canvas.png" alt="" aria-hidden="true" className="pf-art-icon pf-brand-icon" {...props as ImgHTMLAttributes<HTMLImageElement>}/>;
}
