# LuxeCrown: Applying the AWS Well-Architected Framework

## Introduction

Deploying LuxeCrown was an opportunity to understand how the different parts of a cloud application work together, beyond simply getting an application running.

The project involved deploying a salon and barbershop booking application using Amazon S3, Amazon EC2, Amazon RDS for PostgreSQL, and supporting AWS networking and scaling services. My focus was on the AWS infrastructure, deployment configuration, connectivity, and testing.

I used the AWS Well-Architected Framework as a way to think about the decisions behind the deployment. The goal was not just to make the application accessible, but to understand how its infrastructure relates to security, reliability, performance, operational management, and cost.

This document explains how those principles were reflected in my implementation and where I would improve the architecture in a future iteration.

## 1. Operational Excellence

Operational excellence means being able to operate, observe, troubleshoot, and improve a workload rather than treating deployment as the end of the process.

For LuxeCrown, I tested the application across its different layers. I checked the backend API health endpoint, confirmed that the Application Load Balancer was responding, and verified that its target group reported healthy targets. I also tested the booking workflow and compared the frontend confirmation with the booking activity observed in the backend terminal.

These checks helped me investigate the application as a connected system. Instead of looking only at whether the frontend loaded, I could examine whether the load balancer, backend instances, and database infrastructure were configured to support the application.

**What I learned:** A successful deployment requires evidence that the components are communicating as expected. In a future iteration, I would strengthen this approach with centralized application logs, CloudWatch dashboards and alarms, and more comprehensive automated tests.

## 2. Security

Security influenced how I organized the application's network and separated its components.

I configured a VPC using the `10.0.0.0/16` address range, with two public subnets and four private subnets distributed across two Availability Zones. The Application Load Balancer was placed in the public subnets, while the application instances and PostgreSQL database were placed in private subnets.

This separation helped establish distinct network roles: the load balancer provided the application entry point, while the backend and database were not intended to be directly exposed to the public internet.

The design also made me consider the importance of security group rules, database access restrictions, credential management, and least-privilege permissions. Network placement alone does not guarantee security; access must also be controlled through appropriate rules and permissions.

**What I learned:** Security is not a single setting. It depends on multiple layers working together, including network design, identity and access management, and the handling of application secrets.

For a future iteration, I would review the deployed security group rules and IAM permissions, strengthen secrets management, enforce HTTPS, and serve the frontend through a private S3 bucket behind Amazon CloudFront with Origin Access Control.

## 3. Reliability

Reliability was reflected in the way I distributed the application's infrastructure across Availability Zones and configured the application tier for scaling.

The Application Load Balancer was associated with the two public subnets, and its target group showed two healthy targets during testing. I also configured an EC2 Auto Scaling group with application instances distributed across Availability Zones. The PostgreSQL database was configured for Multi-AZ deployment.

These configurations were intended to reduce dependence on a single application instance or Availability Zone and provide a foundation for handling certain infrastructure failures.

The health checks were particularly useful because they provided evidence that the load balancer could identify healthy application targets during testing.

**What I learned:** Configuring high-availability features is not the same as proving that an application can recover from every failure. A complete reliability assessment would require controlled failure testing, recovery validation, and confirmation that application state and database operations remain consistent.

For a future iteration, I would test instance replacement, database failover, and application recovery, then document the results.

## 4. Performance Efficiency

Performance efficiency involves using appropriate resources and architecture to meet workload requirements without unnecessary complexity or waste.

For LuxeCrown, I used an Application Load Balancer to distribute incoming application traffic across healthy targets. I also configured EC2 Auto Scaling so that the application tier could adjust its instance capacity according to the configured scaling settings.

These choices established a foundation for handling changes in demand more effectively than relying on a single application instance.

The project also reinforced the importance of considering the entire request path. A responsive frontend depends on more than its hosting service: the load balancer, backend application, database queries, and network connectivity all influence the overall experience.

**What I learned:** Adding more infrastructure does not automatically make an application faster. Performance decisions should be based on measurements and workload requirements.

In a future iteration, I would use CloudWatch metrics and load testing to evaluate response times, instance utilization, database performance, and scaling behavior before making further architectural changes.

## 5. Cost Optimization

Cost optimization became especially relevant when my AWS credits expired and the deployed environment was no longer active.

The project helped me understand that the cost of a cloud application depends not only on the services selected, but also on how long they run, their capacity, their availability configuration, and their associated data transfer and storage usage.

For example, EC2 instances, load balancers, and database deployments can continue generating charges even when an application receives little or no traffic. Multi-AZ database configurations and additional application instances also need to be evaluated against the workload's availability requirements and budget.

I therefore recognize that a production-oriented architecture must balance reliability and performance with the cost of maintaining those capabilities.

**What I learned:** Cost optimization should be part of architecture planning from the beginning, not something considered only after deployment.

For a future iteration, I would establish AWS Budgets and billing alerts, review AWS Cost Explorer data, right-size resources based on measurements, and evaluate whether each service configuration is justified by the application's requirements. I would also verify the cleanup of unused resources after testing.

## Conclusion

Working on LuxeCrown helped me connect AWS architecture decisions with the practical requirements of deploying an application.

The project gave me experience configuring network segmentation, private application and database tiers, load balancing, Auto Scaling, and Multi-AZ database infrastructure. Testing the load balancer's health, backend API, and booking workflow also helped me appreciate the importance of validating a deployment rather than relying on configuration alone.

My main takeaway is that cloud engineering involves more than assembling services. It requires understanding why those services are used, how they interact, what evidence demonstrates that they work, and what trade-offs they introduce.

The existing deployment provides a foundation to build on. Further validation, stronger observability, security improvements, and cost analysis would be necessary to assess the workload more completely against the AWS Well-Architected Framework.

*Project note: LuxeCrown's original application code was developed separately. My contribution focused on AWS infrastructure configuration, deployment, connectivity troubleshooting, and testing. The AWS environment is currently inactive, and the future improvements described here have not been presented as completed work.*