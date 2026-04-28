"use client";

import React, { useState, useRef, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

// Import default images
import userDefaultImage from "@/../public/images/user.png";
import companyDefaultImage from "@/../public/images/company.png";
import clubLogoDefaultImage from "@/../public/images/club_logo.png";

interface AvatarUploadProps {
  currentImage?: string | null;
  onImageChange: (imageData: string | null) => void;
  name?: string;
  size?: "sm" | "md" | "lg" | "xl";
  shape?: "circle" | "square";
  type?: "user" | "organization" | "sponsor";
  className?: string;
  disabled?: boolean;
}

const sizeClasses = {
  sm: "h-12 w-12",
  md: "h-16 w-16",
  lg: "h-24 w-24",
  xl: "h-32 w-32",
};

const iconSizeClasses = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-8 w-8",
  xl: "h-10 w-10",
};

const buttonSizeClasses = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
  xl: "h-12 w-12",
};

export function AvatarUpload({
  currentImage,
  onImageChange,
  name = "",
  size = "lg",
  shape = "circle",
  type = "user",
  className,
  disabled = false,
}: AvatarUploadProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        console.error("File must be an image");
        return;
      }

      // Max 5MB
      if (file.size > 5 * 1024 * 1024) {
        console.error("File size must be less than 5MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          onImageChange(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    },
    [onImageChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onImageChange(null);
  };

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  const getDefaultImage = () => {
    if (type === "organization") return clubLogoDefaultImage;
    if (type === "sponsor") return companyDefaultImage;
    return userDefaultImage;
  };

  return (
    <div className={cn("relative inline-block", className)}>
      <div
        className={cn(
          "relative cursor-pointer transition-all duration-200",
          isDragging && "scale-105",
          disabled && "cursor-not-allowed opacity-60"
        )}
        onMouseEnter={() => !disabled && setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <Avatar
          className={cn(
            sizeClasses[size],
            shape === "square" && "rounded-lg",
            "border-2 border-gray-200 dark:border-gray-700",
            isDragging && "border-blue-500 border-dashed",
            isHovering && !disabled && "border-blue-400"
          )}
        >
          {currentImage ? (
            <AvatarImage src={currentImage} alt={name} className="object-cover" />
          ) : (
            <AvatarFallback
              className={cn(
                shape === "square" && "rounded-lg",
                "bg-white dark:bg-gray-800 p-1"
              )}
            >
              <Image
                src={getDefaultImage()}
                alt={name || "Default avatar"}
                className="object-contain w-full h-full"
                width={128}
                height={128}
              />
            </AvatarFallback>
          )}
        </Avatar>

        {/* Overlay on hover */}
        {isHovering && !disabled && (
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity",
              shape === "circle" ? "rounded-full" : "rounded-lg"
            )}
          >
            <Camera className="h-6 w-6 text-white" />
          </div>
        )}

        {/* Remove button */}
        {currentImage && !disabled && (
          <Button
            variant="destructive"
            size="icon"
            className={cn(
              "absolute -top-1 -right-1 rounded-full shadow-lg",
              buttonSizeClasses[size === "sm" ? "sm" : "sm"]
            )}
            onClick={handleRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />
    </div>
  );
}

// Logo Upload Component for organizations/sponsors
interface LogoUploadProps {
  currentLogo?: string | null;
  onLogoChange: (logoData: string | null) => void;
  name?: string;
  className?: string;
  disabled?: boolean;
  aspectRatio?: "square" | "wide";
}

export function LogoUpload({
  currentLogo,
  onLogoChange,
  name = "",
  className,
  disabled = false,
  aspectRatio = "square",
}: LogoUploadProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        console.error("File must be an image");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        console.error("File size must be less than 5MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          onLogoChange(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    },
    [onLogoChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onLogoChange(null);
  };

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "relative cursor-pointer transition-all duration-200 border-2 border-dashed rounded-lg overflow-hidden",
          aspectRatio === "square" ? "w-32 h-32" : "w-48 h-24",
          isDragging ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-300 dark:border-gray-600",
          isHovering && !disabled && "border-blue-400 bg-gray-50 dark:bg-gray-800",
          disabled && "cursor-not-allowed opacity-60"
        )}
        onMouseEnter={() => !disabled && setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        {currentLogo ? (
          <img
            src={currentLogo}
            alt={name || "Logo"}
            className="w-full h-full object-contain p-2"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <Image
              src={clubLogoDefaultImage}
              alt="Default logo"
              className="object-contain w-16 h-16 opacity-50"
              width={64}
              height={64}
            />
            <span className="text-xs text-center px-2 text-gray-400 mt-1">
              {isDragging ? "Rilascia qui" : "Carica logo"}
            </span>
          </div>
        )}

        {/* Overlay on hover */}
        {isHovering && !disabled && currentLogo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity">
            <Camera className="h-8 w-8 text-white" />
          </div>
        )}

        {/* Remove button */}
        {currentLogo && !disabled && (
          <Button
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-lg"
            onClick={handleRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />
    </div>
  );
}

// Profile Avatar with name display
interface ProfileAvatarProps {
  image?: string | null;
  name: string;
  subtitle?: string;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  className?: string;
}

export function ProfileAvatar({
  image,
  name,
  subtitle,
  size = "md",
  onClick,
  className,
}: ProfileAvatarProps) {
  const avatarSizes = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };

  const textSizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        onClick && "cursor-pointer hover:opacity-80 transition-opacity",
        className
      )}
      onClick={onClick}
    >
      <Avatar className={cn(avatarSizes[size], "border border-gray-200 dark:border-gray-700")}>
        {image ? (
          <AvatarImage src={image} alt={name} className="object-cover" />
        ) : (
          <AvatarFallback className="bg-white dark:bg-gray-800 p-0.5">
            <Image
              src={userDefaultImage}
              alt={name || "Default avatar"}
              className="object-contain w-full h-full"
              width={48}
              height={48}
            />
          </AvatarFallback>
        )}
      </Avatar>
      <div className="flex flex-col">
        <span className={cn("font-medium", textSizes[size])}>{name}</span>
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </div>
    </div>
  );
}

export default AvatarUpload;
