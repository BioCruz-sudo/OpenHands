import { getToken, getGitHubToken } from "./auth";
import toast from "#/utils/toast";
import { EventEmitter } from 'events';

interface RateLimitInfo {
  requestsRemaining: number;
  resetTime: Date;
  totalLimit: number;
}

class RateLimiter extends EventEmitter {
  private rateLimitInfo: RateLimitInfo;
  private requestQueue: Array<{
    execute: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
    priority?: number;
  }>;
  private isProcessing: boolean;
  private backoffTime: number;

  constructor() {
    super();
    this.rateLimitInfo = {
      requestsRemaining: Infinity,
      resetTime: new Date(),
      totalLimit: Infinity
    };
    this.requestQueue = [];
    this.isProcessing = false;
    this.backoffTime = 1000;
  }

  private updateRateLimits(headers: Headers) {
    const remaining = parseInt(headers.get('x-ratelimit-remaining') || 'Infinity');
    const reset = headers.get('x-ratelimit-reset');
    const limit = parseInt(headers.get('x-ratelimit-limit') || 'Infinity');

    this.rateLimitInfo = {
      requestsRemaining: remaining,
      resetTime: reset ? new Date(parseInt(reset) * 1000) : new Date(),
      totalLimit: limit
    };

    this.emit('limitUpdate', this.rateLimitInfo);
  }

  private calculateBackoff(): number {
    if (this.rateLimitInfo.requestsRemaining === Infinity) return 0;
    
    const remainingPercentage = this.rateLimitInfo.requestsRemaining / this.rateLimitInfo.totalLimit;
    if (remainingPercentage > 0.5) return 0;
    if (remainingPercentage > 0.2) return this.backoffTime;
    if (remainingPercentage > 0.1) return this.backoffTime * 2;
    return this.backoffTime * 4;
  }

  public getRateLimitInfo(): RateLimitInfo {
    return { ...this.rateLimitInfo };
  }

  async enqueue<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ execute, resolve, reject });
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) return;

    this.isProcessing = true;
    while (this.requestQueue.length > 0) {
      const backoff = this.calculateBackoff();
      if (backoff > 0) {
        await new Promise(resolve => setTimeout(resolve, backoff));
      }

      const request = this.requestQueue.shift()!;
      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (error) {
        if (error instanceof Response && error.status === 429) {
          this.backoffTime *= 2;
          this.requestQueue.unshift(request);
          await new Promise(resolve => setTimeout(resolve, this.backoffTime));
        } else {
          request.reject(error);
        }
      }
    }
    this.isProcessing = false;
  }
}

const rateLimiter = new RateLimiter();
const WAIT_FOR_AUTH_DELAY_MS = 500;
const UNAUTHED_ROUTE_PREFIXES = [
  "/api/authenticate",
  "/api/options/",
  "/config.json",
  "/api/github/callback",
];

export async function request(
  url: string,
  options: RequestInit = {},
  disableToast: boolean = false,
  returnResponse: boolean = false,
  maxRetries: number = 3,
): Promise<any> {
  const executeRequest = async () => {
    if (maxRetries < 0) {
      throw new Error("Max retries exceeded");
    }

    const onFail = (msg: string) => {
      if (!disableToast) {
        toast.error("api", msg);
      }
      throw new Error(msg);
    };

    const needsAuth = !UNAUTHED_ROUTE_PREFIXES.some((prefix) =>
      url.startsWith(prefix),
    );

    const token = getToken();
    const githubToken = getGitHubToken();

    if (!token && needsAuth) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            request(url, options, disableToast, returnResponse, maxRetries - 1),
          );
        }, WAIT_FOR_AUTH_DELAY_MS);
      });
    }

    const headers = {
      ...(options.headers || {}),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(githubToken && { "X-GitHub-Token": githubToken }),
    };

    const finalOptions = { ...options, headers };
    let response: Response | null = null;

    try {
      response = await fetch(url, finalOptions);

      if (response.headers) {
        rateLimiter.updateRateLimits(response.headers);
      }

      if (response.status === 401) {
        await request(
          "/api/authenticate",
          { method: "POST" },
          true,
        );
        return request(url, options, disableToast, returnResponse, maxRetries - 1);
      }

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '5');
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        return request(url, options, disableToast, returnResponse, maxRetries - 1);
      }

      if (response.status >= 400) {
        onFail(
          `${response.status} error while fetching ${url}: ${response.statusText}`,
        );
      }

      if (!response.ok) {
        onFail(`Error fetching ${url}: ${response.statusText}`);
      }

      if (returnResponse) {
        return response;
      }

      try {
        const data = await response.json();
        return data;
      } catch (e) {
        onFail(`Error parsing JSON from ${url}`);
      }
    } catch (e) {
      onFail(`Error fetching ${url}`);
      throw e;
    }
  };

  return rateLimiter.enqueue(executeRequest);
}

// Export rate limiter functionality
export const getRateLimitInfo = () => rateLimiter.getRateLimitInfo();
