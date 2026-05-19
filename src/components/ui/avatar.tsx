'use client'

import * as React from 'react'
import Image from 'next/image'
import * as AvatarPrimitive from '@radix-ui/react-avatar'

import { cn } from '@/lib/utils'

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn('aspect-square h-full w-full', className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn('flex h-full w-full items-center justify-center rounded-full bg-muted', className)}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

type DraHildaAvatarProps = {
  size?: 'sm' | 'md' | 'lg' | 'chat' | 'xl'
  showStatus?: boolean
  className?: string
}

const sizeMap = {
  sm: 32,
  md: 40,
  lg: 56,
  chat: 70,
  xl: 80,
}

export default function DraHildaAvatar({
  size = 'md',
  showStatus = false,
  className = '',
}: DraHildaAvatarProps) {
  const px = sizeMap[size]

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <Image
        src="/images/dra_hilda_avatar.webp"
        alt="Dra. Hilda"
        width={px}
        height={px}
        className="rounded-full object-cover ring-2 ring-white shadow-md"
        priority={size === 'xl' || size === 'lg'}
      />
      {showStatus && (
        <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-green-400 ring-2 ring-white" />
      )}
    </div>
  )
}

export { Avatar, AvatarImage, AvatarFallback }
