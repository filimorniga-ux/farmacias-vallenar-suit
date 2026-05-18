"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const Tabs = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { defaultValue?: string }
>(({ className, defaultValue, ...props }, ref) => {
    const [value, setValue] = React.useState(defaultValue)
    const baseId = React.useId()

    return (
        <TabsContext.Provider value={{ value, setValue, baseId }}>
            <div ref={ref} className={cn("", className)} {...props} />
        </TabsContext.Provider>
    )
})
Tabs.displayName = "Tabs"

const TabsContext = React.createContext<{
    value?: string
    setValue: (value: string) => void
    baseId: string
} | null>(null)

function getTabIds(baseId: string, value: string) {
    const normalizedValue = value.replace(/[^a-zA-Z0-9_-]/g, "-")
    return {
        triggerId: `${baseId}-trigger-${normalizedValue}`,
        contentId: `${baseId}-content-${normalizedValue}`,
    }
}

function moveFocus(currentTarget: HTMLElement, key: string) {
    const triggers = Array.from(
        currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')
    )
    const currentIndex = triggers.findIndex((trigger) => trigger === document.activeElement)

    if (triggers.length === 0 || currentIndex === -1) {
        return
    }

    const lastIndex = triggers.length - 1
    const nextIndexByKey: Record<string, number> = {
        ArrowRight: currentIndex === lastIndex ? 0 : currentIndex + 1,
        ArrowDown: currentIndex === lastIndex ? 0 : currentIndex + 1,
        ArrowLeft: currentIndex === 0 ? lastIndex : currentIndex - 1,
        ArrowUp: currentIndex === 0 ? lastIndex : currentIndex - 1,
        Home: 0,
        End: lastIndex,
    }
    const nextIndex = nextIndexByKey[key]

    if (nextIndex === undefined) {
        return
    }

    const nextTrigger = triggers[nextIndex]
    nextTrigger?.focus()
    nextTrigger?.click()
}

const TabsList = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, onKeyDown, ...props }, ref) => {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return

        if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            moveFocus(event.currentTarget, event.key)
        }
    }

    return (
        <div
            ref={ref}
            role="tablist"
            className={cn(
                "inline-flex h-auto min-h-11 items-center justify-center rounded-md bg-slate-100 p-1 text-slate-500",
                className
            )}
            onKeyDown={handleKeyDown}
            {...props}
        />
    )
})
TabsList.displayName = "TabsList"

const TabsTrigger = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className, value, onClick, ...props }, ref) => {
    const context = React.useContext(TabsContext)
    const isActive = context?.value === value
    const ids = context ? getTabIds(context.baseId, value) : undefined

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
            context?.setValue(value)
        }
    }

    return (
        <button
            ref={ref}
            id={ids?.triggerId}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={ids?.contentId}
            tabIndex={isActive ? 0 : -1}
            className={cn(
                "inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                isActive
                    ? "bg-white text-slate-950 shadow-sm"
                    : "hover:bg-slate-200/50 hover:text-slate-700",
                className
            )}
            onClick={handleClick}
            {...props}
        />
    )
})
TabsTrigger.displayName = "TabsTrigger"

const TabsContent = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, ...props }, ref) => {
    const context = React.useContext(TabsContext)
    if (context?.value !== value) return null
    const ids = getTabIds(context.baseId, value)

    return (
        <div
            ref={ref}
            id={ids.contentId}
            role="tabpanel"
            aria-labelledby={ids.triggerId}
            tabIndex={0}
            className={cn(
                "mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2",
                className
            )}
            {...props}
        />
    )
})
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent }
