"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const createAccessCode = () => {
  const values = new Uint32Array(2);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(36).toUpperCase())
    .join("")
    .slice(0, 10);
};

export function AccessCodeGenerator() {
  const [accessCode, setAccessCode] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Codice di accesso</CardTitle>
        <CardDescription>
          Genera un codice temporaneo da condividere con il nuovo membro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border bg-slate-50 p-4 text-center font-mono text-xl tracking-widest">
          {accessCode || "—"}
        </div>
      </CardContent>
      <CardFooter>
        <Button type="button" onClick={() => setAccessCode(createAccessCode())}>
          Genera codice
        </Button>
      </CardFooter>
    </Card>
  );
}

export default AccessCodeGenerator;
