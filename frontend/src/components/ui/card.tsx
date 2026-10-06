import * as React from "react"

import { cn } from "@/lib/utils"



function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col overflow-hidden rounded-xl bg-card text-sm text-card-foreground ring-1 ring-foreground/10",
        className
      )}
      {...props}
    />
  )
}

export { Card }
