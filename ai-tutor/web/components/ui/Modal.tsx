"use client";

import React, { useEffect } from "react";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  showCloseButton?: boolean;
}

const sizeStyles = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  showCloseButton = true,
}: ModalProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        className={`
        relative bg-white rounded-2xl shadow-2xl w-full mx-4
        animate-in zoom-in-95 fade-in
        ${sizeStyles[size]}
      `}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            {title && <h3 className="font-bold text-slate-900">{title}</h3>}
            {showCloseButton && (
              <ModalCloseButton onClick={onClose} absolute={false} className="ml-auto" />
            )}
          </div>
        )}

        {/* Body */}
        {children}
      </div>
    </div>
  );
}
