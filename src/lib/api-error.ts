import { NextResponse } from "next/server"
import { logError } from "./logger"

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message)
  }
}

export function errorResponse(error: unknown, route?: string) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    )
  }
  console.error("Unhandled error:", error)
  if (route) {
    logError(route, "Unhandled error", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "An unexpected error occurred" },
    { status: 500 }
  )
}
