import { NextResponse } from "next/server";
import { getBaseUrl } from "../../../lib/baseUrl";

export async function GET() {
  const base = await getBaseUrl();
  return NextResponse.json({
    resource: base,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
  });
}
