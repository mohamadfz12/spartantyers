/* ------------------------------------------------------------------ *
 * Spartan Tyres UI primitives
 *
 * Hand-rolled (no Radix), token-driven, keyboard-operable and
 * reduced-motion aware. Import from '@/components/ui'.
 * ------------------------------------------------------------------ */

export { Button, buttonClasses } from './button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './button'

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card'
export type { CardProps } from './card'

export { Input, Textarea, Label, FieldError, Field, fieldSkin } from './input'
export type {
  InputProps,
  TextareaProps,
  LabelProps,
  FieldErrorProps,
  FieldProps,
} from './input'

export { Select } from './select'
export type { SelectProps } from './select'

export { Badge } from './badge'
export type { BadgeProps, BadgeVariant, BadgeSize } from './badge'

export { Checkbox } from './checkbox'
export type { CheckboxProps } from './checkbox'

export { Rating } from './rating'
export type { RatingProps, RatingSize } from './rating'

export { Accordion, AccordionItem } from './accordion'
export type { AccordionProps, AccordionItemProps } from './accordion'

export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'
export type {
  TabsProps,
  TabsListProps,
  TabsTriggerProps,
  TabsContentProps,
} from './tabs'

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from './dialog'
export type { DialogProps, DialogContentProps, DialogCloseProps, DialogSize } from './dialog'

export { Sheet, SheetHeader, SheetTitle, SheetClose } from './sheet'
export type { SheetProps, SheetCloseProps, SheetSide } from './sheet'

export { Tooltip } from './tooltip'
export type { TooltipProps, TooltipSide } from './tooltip'

export { Skeleton, SkeletonText, SkeletonCard } from './skeleton'
export type { SkeletonProps, SkeletonTextProps, SkeletonCardProps } from './skeleton'

export { Toaster } from './toaster'

export { Progress, Stepper } from './progress'
export type { ProgressProps, StepperProps } from './progress'

/** Overlay internals — exported for anyone building a bespoke modal surface. */
export { useFocusTrap, getFocusable } from './use-overlay'
