import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type EmptyStateAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "default" | "outline" | "secondary";
};

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description: string;
  hint?: string;
  actions?: EmptyStateAction[];
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  hint,
  actions,
  className,
}: EmptyStateProps) {
  return (
    <Card
      className={cn(
        "border-dashed border-muted-foreground/25 bg-muted/30",
        className
      )}
    >
      <CardHeader className="items-center text-center pb-2">
        {Icon ? (
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Icon className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
          </div>
        ) : null}
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="max-w-md text-sm leading-relaxed">
          {description}
        </CardDescription>
      </CardHeader>
      {hint ? (
        <CardContent className="text-center pb-2">
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      ) : null}
      {actions && actions.length > 0 ? (
        <CardFooter className="justify-center gap-3 pt-2">
          {actions.map((action) => {
            if (action.href) {
              return (
                <a
                  key={action.label}
                  href={action.href}
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/80"
                >
                  {action.label}
                </a>
              );
            }
            return (
              <Button
                key={action.label}
                variant={action.variant ?? "default"}
                size="sm"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            );
          })}
        </CardFooter>
      ) : null}
    </Card>
  );
}
