import { request } from "#/services/api";
import { cache } from "#/utils/cache";
import {
  SaveFileSuccessResponse,
  FileUploadSuccessResponse,
  Feedback,
  FeedbackResponse,
  GitHubAccessTokenResponse,
  ErrorResponse,
  GetConfigResponse,
} from "./open-hands.types";

interface RateLimitInfo {
  requestsRemaining: number;
  resetTime: Date;
  totalLimit: number;
}

class OpenHands {
  private static rateLimitInfo: RateLimitInfo = {
    requestsRemaining: Infinity,
    resetTime: new Date(),
    totalLimit: Infinity
  };

  private static updateRateLimitInfo(headers: Headers) {
    const remaining = parseInt(headers.get('x-ratelimit-remaining') || 'Infinity');
    const reset = headers.get('x-ratelimit-reset');
    const limit = parseInt(headers.get('x-ratelimit-limit') || 'Infinity');

    this.rateLimitInfo = {
      requestsRemaining: remaining,
      resetTime: reset ? new Date(parseInt(reset) * 1000) : new Date(),
      totalLimit: limit
    };
  }

  /**
   * Get current rate limit information
   * @returns Current rate limit status
   */
  static getRateLimitStatus(): RateLimitInfo {
    return { ...this.rateLimitInfo };
  }

  /**
   * Retrieve the list of models available
   * @returns List of models available
   */
  static async getModels(): Promise<string[]> {
    const cachedData = cache.get<string[]>("models");
    if (cachedData) return cachedData;

    const data = await request("/api/options/models");
    cache.set("models", data);

    return data;
  }

  /**
   * Retrieve the list of agents available
   * @returns List of agents available
   */
  static async getAgents(): Promise<string[]> {
    const cachedData = cache.get<string[]>("agents");
    if (cachedData) return cachedData;

    const data = await request(`/api/options/agents`);
    cache.set("agents", data);

    return data;
  }

  /**
   * Retrieve the list of security analyzers available
   * @returns List of security analyzers available
   */
  static async getSecurityAnalyzers(): Promise<string[]> {
    const cachedData = cache.get<string[]>("security-analyzers"); // Fixed cache key
    if (cachedData) return cachedData;

    const data = await request(`/api/options/security-analyzers`);
    cache.set("security-analyzers", data);

    return data;
  }

  static async getConfig(): Promise<GetConfigResponse> {
    const cachedData = cache.get<GetConfigResponse>("config");
    if (cachedData) return cachedData;

    const data = await request("/config.json");
    cache.set("config", data);

    return data;
  }

  /**
   * Retrieve the list of files available in the workspace
   * @param path Path to list files from
   * @returns List of files available in the given path. If path is not provided, it lists all the files in the workspace
   */
  static async getFiles(path?: string): Promise<string[]> {
    const cacheKey = path ? `files:${path}` : 'files:root';
    const cachedData = cache.get<string[]>(cacheKey);
    if (cachedData) return cachedData;

    let url = "/api/list-files";
    if (path) url += `?path=${encodeURIComponent(path)}`;
    const data = await request(url);
    cache.set(cacheKey, data);

    return data;
  }

  /**
   * Retrieve the content of a file
   * @param path Full path of the file to retrieve
   * @returns Content of the file
   */
  static async getFile(path: string): Promise<string> {
    const cacheKey = `file:${path}`;
    const cachedData = cache.get<string>(cacheKey);
    if (cachedData) return cachedData;

    const url = `/api/select-file?file=${encodeURIComponent(path)}`;
    const data = await request(url);
    const content = data.code;
    cache.set(cacheKey, content);

    return content;
  }

  /**
   * Save the content of a file
   * @param path Full path of the file to save
   * @param content Content to save in the file
   * @returns Success message or error message
   */
  static async saveFile(
    path: string,
    content: string,
  ): Promise<SaveFileSuccessResponse | ErrorResponse> {
    const response = await request(`/api/save-file`, {
      method: "POST",
      body: JSON.stringify({ filePath: path, content }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Invalidate relevant caches
    cache.delete(`file:${path}`);
    cache.delete('files:root');
    cache.delete(`files:${path.split('/').slice(0, -1).join('/')}`);

    return response;
  }

  /**
   * Upload a file to the workspace
   * @param file File to upload
   * @returns Success message or error message
   */
  static async uploadFiles(
    file: File[],
  ): Promise<FileUploadSuccessResponse | ErrorResponse> {
    const formData = new FormData();
    file.forEach((f) => formData.append("files", f));

    const response = await request(`/api/upload-files`, {
      method: "POST",
      body: formData,
    });

    // Invalidate file listing caches
    cache.delete('files:root');
    file.forEach(f => {
      const path = f.webkitRelativePath || f.name;
      const dir = path.split('/').slice(0, -1).join('/');
      if (dir) cache.delete(`files:${dir}`);
    });

    return response;
  }

  /**
   * Get the blob of the workspace zip
   * @returns Blob of the workspace zip
   */
  static async getWorkspaceZip(): Promise<Blob> {
    const response = await request(`/api/zip-directory`, {}, false, true);
    return response.blob();
  }

  /**
   * Send feedback to the server
   * @param data Feedback data
   * @returns The stored feedback data
   */
  static async submitFeedback(data: Feedback): Promise<FeedbackResponse> {
    return request(`/api/submit-feedback`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * @param code Code provided by GitHub
   * @returns GitHub access token
   */
  static async getGitHubAccessToken(
    code: string,
  ): Promise<GitHubAccessTokenResponse> {
    return request(`/api/github/callback`, {
      method: "POST",
      body: JSON.stringify({ code }),
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Authenticate with GitHub token
   * @returns Response with authentication status and user info if successful
   */
  static async authenticate(): Promise<Response> {
    return request(
      `/api/authenticate`,
      {
        method: "POST",
      },
      true,
    );
  }

  /**
   * Check current rate limit status
   * @returns Current rate limit information and reset time
   */
  static async checkRateLimit(): Promise<RateLimitInfo> {
    try {
      const response = await request('/api/rate-limit', {}, true);
      this.rateLimitInfo = response;
      return response;
    } catch (error) {
      // If rate limit endpoint is not available, return current stored info
      return this.getRateLimitStatus();
    }
  }
}

export default OpenHands;
