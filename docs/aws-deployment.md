# Publish Lattice on AWS

Final address: **https://lattice.abhijeet-anand.com**.

Repository: **Bubble-Bounce-Games/lattice**. Use the same AWS account as Focus List: **990723918097**. These steps create separate Lattice resources.

Lattice uses a private S3 bucket for the website, CloudFront for HTTPS, and API Gateway/Lambda/DynamoDB for accounts and saved entries. Each person has a private library. S3 alone cannot run the API.

## 1. Save the website to GitHub

The website source, AWS templates, and workflow must be committed and pushed to `main` in `Bubble-Bounce-Games/lattice`. Check that GitHub shows the `aws/`, `src/`, and `.github/workflows/deploy-aws.yml` files.

The workflow appears as **Actions → Deploy Lattice AWS**. Automatic deployment is initially disabled so the first push does not attempt to deploy before AWS setup is complete.

## 2. Create the private buckets and deployment role

1. Sign in to AWS account **990723918097**.
2. Choose **Asia Pacific (Singapore)**, `ap-southeast-1`.
3. Open **CloudFormation → Create stack → With new resources (standard)**.
4. Choose **Choose an existing template → Upload a template file**.
5. Upload [`aws/infrastructure/bootstrap.yml`](../aws/infrastructure/bootstrap.yml) from this project. You can also download that file from GitHub first.
6. Choose **Next** and name the stack **lattice-bootstrap**.
7. Continue through the options with defaults. Acknowledge that CloudFormation can create IAM resources with custom names, then submit.
8. Wait for **CREATE_COMPLETE**.

The stack creates:

| Resource                    | Name                                         |
| --------------------------- | -------------------------------------------- |
| Website bucket              | `lattice.abhijeet-anand.com`                 |
| Deployment artifacts bucket | `lattice-deploy-990723918097-ap-southeast-1` |
| GitHub deployment role      | `GitHubActionsLatticeDeploy`                 |

Keep **Block all public access** enabled on both buckets. CloudFront receives signed read access to the website bucket during deployment. Do not enable S3 static website hosting or add a public-read policy.

The role trusts only the `aws-s3` GitHub environment in `Bubble-Bounce-Games/lattice`, using the GitHub OIDC provider already established for Focus List. If the stack reports that `token.actions.githubusercontent.com` does not exist, open **IAM → Identity providers → Add provider**, choose **OpenID Connect**, use provider URL `https://token.actions.githubusercontent.com` and audience `sts.amazonaws.com`, then retry the stack.

If either bucket already exists, do not delete it or create a second stack blindly. Check whether an earlier `lattice-bootstrap` stack already owns it and update that stack instead.

## 3. Request the HTTPS certificate

1. Switch AWS to **US East (N. Virginia)**, `us-east-1`.
2. Open **Certificate Manager → Request → Request a public certificate**.
3. Enter **lattice.abhijeet-anand.com**.
4. Choose **DNS validation**, keep **RSA 2048**, and request the certificate.
5. Open the certificate and expand its **Domains** section. Copy the validation **CNAME name** and **CNAME value**.
6. In Porkbun, open **abhijeet-anand.com → DNS records** and add:

| Field  | Value                                                                     |
| ------ | ------------------------------------------------------------------------- |
| Type   | `CNAME`                                                                   |
| Host   | The validation CNAME name with the trailing `.abhijeet-anand.com` removed |
| Answer | The complete ACM validation CNAME value                                   |
| TTL    | Default                                                                   |

For example, if AWS gives `_abc.lattice.abhijeet-anand.com`, enter `_abc.lattice` as the Porkbun Host. Copy your actual AWS values.

7. Wait until ACM shows **Issued**.
8. Copy the certificate ARN. It must start with `arn:aws:acm:us-east-1:990723918097:certificate/` and cover `lattice.abhijeet-anand.com`. A Focus List certificate can be reused only if it also covers Lattice or `*.abhijeet-anand.com`.

Keep this validation CNAME permanently so AWS can renew the certificate.

## 4. Configure the GitHub deployment environment

1. Open **GitHub → Bubble-Bounce-Games/lattice → Settings → Environments**.
2. Create an environment named exactly **aws-s3**.
3. Restrict its deployment branches to **main**.
4. Under **Environment variables**, add:

| Name                         | Value                                          |
| ---------------------------- | ---------------------------------------------- |
| `CLOUDFRONT_CERTIFICATE_ARN` | The issued Lattice certificate ARN from step 3 |

The account, region, bucket names, and role ARN are already set in the workflow. No AWS access keys, Focus List API URL, Cognito settings, or Supabase settings are needed.

## 5. Deploy

1. Open **Actions → Deploy Lattice AWS → Run workflow**.
2. Select **main** and run the workflow.
3. Wait for the workflow to pass. The first deployment can take several minutes while CloudFront is created.
4. Open the run's **Summary** and copy the **DnsTarget** output, such as `d123example.cloudfront.net`.

The workflow checks types, lint, and tests; builds the website and Lambda bundle; deploys the `lattice-api` stack in Singapore; uploads the website; and deploys the `lattice-edge` stack in N. Virginia. API responses are never cached, and CloudFront forwards session cookies to the API.

## 6. Connect the domain in Porkbun

Add this DNS record for **abhijeet-anand.com**:

| Field  | Value                                                           |
| ------ | --------------------------------------------------------------- |
| Type   | `CNAME`                                                         |
| Host   | `lattice`                                                       |
| Answer | The **DnsTarget** CloudFront hostname from the workflow summary |
| TTL    | Default                                                         |

If there is already a conflicting record for the exact `lattice` hostname, replace it. Keep the certificate validation CNAME and the records for Focus List and the main domain.

Wait for DNS propagation, then open **https://lattice.abhijeet-anand.com**. Use this custom address to sign in; the API checks this origin for mutations.

## 7. Verify and enable future deployments

1. Sign in with an email and a password of at least eight characters. First sign-in saves that email's access automatically; subsequent visits require the same password. These are separate accounts from Focus List. Password recovery is not included yet.
2. Create an entry, refresh, edit it, search for it, and use **Settings → Export library**.
3. Sign out, create a second account, and confirm the second library is empty.
4. Sign back in with the first account and confirm its entry remains.
5. Open **GitHub → Settings → Secrets and variables → Actions → Variables** and add a **repository variable** named `AWS_DEPLOY_ENABLED` with value `true`.

Future pushes to `main` will then deploy automatically. You can also run the workflow manually at any time.

Local SQLite entries remain on your machine. To transfer a Lattice JSON export to AWS, use `node scripts/import-aws.mjs lattice-export.json --email person@example.com --apply`. The script prompts for the password without echo and verifies all imported entries, including their original dates. Re-running skips identical existing records. The local `db:import` command still targets local SQLite only.

## Troubleshooting

- **The workflow is skipped on push:** automatic deployment is disabled until `AWS_DEPLOY_ENABLED=true` is set as a repository variable. Use **Run workflow** for the first deployment.
- **Missing certificate variable:** add `CLOUDFRONT_CERTIFICATE_ARN` to the `aws-s3` environment, then rerun.
- **Not authorized to assume role:** confirm `lattice-bootstrap` completed, the role is named `GitHubActionsLatticeDeploy`, and the workflow uses the exact `aws-s3` environment. The Focus List role has a separate trust policy.
- **Certificate error:** ensure the certificate is Issued, in `us-east-1`, in the same AWS account, and covers the exact Lattice hostname.
- **CloudFormation error:** inspect the failed stack's **Events** tab. If an initial stack reaches `ROLLBACK_COMPLETE`, correct the cause, then delete only that failed stack before retrying. The database and buckets have retention policies; retain them and inspect ownership before recreating anything.
- **S3 AccessDenied when opening the bucket directly:** expected for a private origin. Open the custom HTTPS domain through CloudFront.
- **Website loads but API fails:** verify the workflow deployed both stacks, DNS points to its CloudFront distribution, and `/api/session` returns `401` before sign-in rather than an S3/XML response. Sign-in requires the configured custom domain.

AWS references: [private S3 access through CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html), [CloudFront certificate requirements](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html), and [GitHub OIDC roles](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html).
