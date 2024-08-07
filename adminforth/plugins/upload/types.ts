
export type PluginOptions = {

  /**
   * The name of the column where the path to the uploaded file is stored.
   * On place of this column, a file upload field will be shown.
   */
  pathColumnName: string;

  /**
   * the list of allowed file extensions
   */
  allowedFileExtensions?: string[]; // allowed file extensions

  /**
   * the maximum file size in bytes
   */
  maxFileSize?: number;

  /**
   * S3 bucket name where we will upload the files, e.g. 'my-bucket'
   */
  s3Bucket: string,

  /**
   * S3 region, e.g. 'us-east-1'
   */
  s3Region: string,

  /**
   * S3 access key id
   */
  s3AccessKeyId: string,

  /**
   * S3 secret access key
   */
  s3SecretAccessKey: string,

  /**
   * ACL which will be set to uploaded file, e.g. 'public-read'.
   * If you want to use 'public-read', it is your responsibility to set the "ACL Enabled" to true in the S3 bucket policy and Uncheck "Block all public access" in the bucket settings.
   */
  s3ACL?: string,

  /**
   * The path where the file will be uploaded to the S3 bucket, same path will be stored in the database
   * in the column specified in {@link pathColumnName}
   * 
   * example:
   * 
   * ```typescript
   * s3Path: ({record, originalFilename}) => `/aparts/${record.id}/${originalFilename}`
   * ```
   * 
   */
  s3Path: ({originalFilename, originalExtension, contentType}) => string,


  preview: {

    /**
     * By default preview is shown in the show view only. If you want to show it in the list view as well, set this to true
     */
    showInList: boolean,

    /**
     * Used to display preview (if it is image) in list and show views.
     * Defaulted to the AWS S3 presigned URL if resource is private or public URL if resource is public.
     * Can be used to generate custom e.g. CDN(e.g. Cloudflare) URL to worm up cache and deliver preview faster.
     * 
     * Example:
     * 
     * ```typescript
     * previewUrl: ({record, path}) => `https://my-bucket.s3.amazonaws.com/${path}`,
     * ```
     * 
     */ 
    previewUrl?: ({s3Path}) => string,
  }
}