import type { ImgHTMLAttributes } from "react";

export type DeepSignalMascotPose = "peek" | "grab" | "loading" | "success" | "guardian";

type DeepSignalMascotProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  pose: DeepSignalMascotPose;
};

export function DeepSignalMascot({ pose, className = "", alt = "", ...props }: DeepSignalMascotProps) {
  return (
    <img
      {...props}
      className={`deepsignal-mascot deepsignal-mascot-${pose} ${className}`.trim()}
      src={`/mascot/deepsignal-frog/${pose}.png`}
      alt={alt}
      data-pose={pose}
      decoding={props.decoding ?? "async"}
      draggable={props.draggable ?? false}
    />
  );
}
